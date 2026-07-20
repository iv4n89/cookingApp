import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { embedText, type GeneratedRecipe } from './gemini.ts';
import { ALLERGEN_KEYS, DIET_KEYS, sanitizeKeys } from './preferences.ts';

export interface RecipeData {
  title: string;
  description?: string;
  source?: 'web' | 'generated';
  source_url?: string | null;
  image_url?: string | null;
  servings?: number;
  prep_time_min?: number;
  cook_time_min?: number;
  calories?: number | null;
  tags?: string[];
  allergens?: string[] | null;
  diet?: string[] | null;
  ingredients?: { name: string }[];
  steps?: unknown[];
}

const RETURN_COLUMNS =
  'id, title, description, source, source_url, image_url, servings, prep_time_min, cook_time_min, calories, tags, ingredients, steps';

// Texto representativo de la receta para el embedding (lo que la hace "encontrable").
function embeddingText(recipe: RecipeData): string {
  const ingredients = (recipe.ingredients ?? []).map((i) => i.name).join(', ');
  return [recipe.title, recipe.description ?? '', (recipe.tags ?? []).join(', '), ingredients]
    .filter(Boolean)
    .join('\n');
}

function parseQuantity(value?: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

// Normaliza la receta de Gemini a la forma de dominio (packages/shared/types.ts):
// Ingredient {name, quantity, unit, substitutions} y RecipeStep {order, instruction, timerSeconds}.
// Si viene de una fuente web se marca source='web' con su source_url para atribución.
export function recipeFromGenerated(g: GeneratedRecipe, sourceUrl?: string | null): RecipeData {
  return {
    title: g.title,
    description: g.description,
    source: sourceUrl ? 'web' : 'generated',
    source_url: sourceUrl ?? null,
    servings: g.servings,
    prep_time_min: g.prep_time_min,
    cook_time_min: g.cook_time_min,
    calories: g.calories ?? null,
    tags: g.tags ?? [],
    allergens: sanitizeKeys(g.allergens, ALLERGEN_KEYS),
    diet: sanitizeKeys(g.diet, DIET_KEYS),
    ingredients: g.ingredients.map((i) => ({
      name: i.name,
      quantity: parseQuantity(i.quantity),
      unit: i.unit?.trim() || null,
      substitutions: [],
    })),
    steps: g.steps.map((s, index) => ({
      order: index + 1,
      instruction: s.instruction,
      timerSeconds:
        typeof s.timer_seconds === 'number' && s.timer_seconds > 0 ? s.timer_seconds : null,
    })),
  };
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Enlaza cada ingrediente de la receta al catálogo por nombre normalizado,
// creando en el catálogo (categoría 'Otros') los que no existan.
async function withIngredientIds(
  supabase: SupabaseClient,
  ingredients: { name: string }[],
): Promise<Record<string, unknown>[]> {
  if (ingredients.length === 0) return [];
  const norms = [...new Set(ingredients.map((i) => normalizeName(i.name)).filter(Boolean))];

  const { data: existing } = await supabase
    .from('ingredients')
    .select('id, normalized_name')
    .in('normalized_name', norms);
  const map = new Map<string, string>((existing ?? []).map((r) => [r.normalized_name, r.id]));

  const missing = norms.filter((n) => !map.has(n));
  if (missing.length > 0) {
    const rows = missing.map((n) => ({
      name: ingredients.find((i) => normalizeName(i.name) === n)!.name.trim(),
      normalized_name: n,
      category: 'Otros',
    }));
    await supabase
      .from('ingredients')
      .upsert(rows, { onConflict: 'normalized_name', ignoreDuplicates: true });
    const { data: after } = await supabase
      .from('ingredients')
      .select('id, normalized_name')
      .in('normalized_name', missing);
    for (const r of after ?? []) map.set(r.normalized_name, r.id);
  }

  return ingredients.map((i) => ({ ...i, ingredient_id: map.get(normalizeName(i.name)) ?? null }));
}

export async function saveRecipe(supabase: SupabaseClient, recipe: RecipeData) {
  const embedding = await embedText(embeddingText(recipe), 'RETRIEVAL_DOCUMENT');
  const ingredients = await withIngredientIds(supabase, recipe.ingredients ?? []);
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      title: recipe.title,
      description: recipe.description ?? '',
      source: recipe.source ?? 'generated',
      source_url: recipe.source_url ?? null,
      image_url: recipe.image_url ?? null,
      servings: recipe.servings ?? 2,
      prep_time_min: recipe.prep_time_min ?? 0,
      cook_time_min: recipe.cook_time_min ?? 0,
      calories: recipe.calories ?? null,
      tags: recipe.tags ?? [],
      allergens: recipe.allergens ?? null,
      diet: recipe.diet ?? null,
      ingredients,
      steps: recipe.steps ?? [],
      embedding,
    })
    .select(RETURN_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
