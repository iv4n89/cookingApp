import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { embedText, resolveIngredients, type GeneratedRecipe, type ResolvedIngredient } from './gemini.ts';
import { ALLERGEN_KEYS, CATALOG_CATEGORIES, DIET_KEYS, MEAL_TYPE_KEYS, sanitizeKeys } from './preferences.ts';

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
  meal_types?: string[] | null;
  ingredients?: { name: string }[];
  steps?: unknown[];
  // false para recetas personalizadas del chat: no entran en la caché semántica compartida.
  reusable?: boolean;
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
// Las recetas las genera el LLM (platos reales), sin fuente web ni atribución.
export function recipeFromGenerated(g: GeneratedRecipe): RecipeData {
  return {
    title: g.title,
    description: g.description,
    source: 'generated',
    source_url: null,
    servings: g.servings,
    prep_time_min: g.prep_time_min,
    cook_time_min: g.cook_time_min,
    calories: g.calories ?? null,
    tags: g.tags ?? [],
    allergens: sanitizeKeys(g.allergens, ALLERGEN_KEYS),
    diet: sanitizeKeys(g.diet, DIET_KEYS),
    meal_types: sanitizeKeys(g.meal_types, MEAL_TYPE_KEYS),
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

// Enlaza cada ingrediente de la receta al catálogo por su canónico. Orden de resolución:
// (1) match exacto por normalized_name; (2) caché de alias (ingredient_aliases) de nombres ya
// resueltos antes; (3) solo lo que quede va al resolver IA, que mapea a un canonical_name del
// catálogo y crea los nuevos bien categorizados. Tras la IA se cachean los pares nuevos. Nunca
// se crean entradas en 'Otros'. Ante fallo de IA: exacto + caché y el resto sin enlazar; la
// receta se guarda igual.
async function withIngredientIds(
  supabase: SupabaseClient,
  ingredients: { name: string }[],
): Promise<Record<string, unknown>[]> {
  if (ingredients.length === 0) return [];

  const norms = [...new Set(ingredients.map((i) => normalizeName(i.name)).filter(Boolean))];

  // (1) Índice del catálogo COMPLETO por normalized_name.
  const { data: exact } = await supabase
    .from('ingredients')
    .select('id, normalized_name')
    .in('normalized_name', norms);
  const exactByNorm = new Map<string, string>((exact ?? []).map((r) => [r.normalized_name, r.id]));

  // (2) Caché de alias: nombres del LLM ya resueltos antes, para no volver a llamar a la IA.
  const unresolvedNorms = norms.filter((n) => !exactByNorm.has(n));
  const aliasByNorm = new Map<string, string>();
  if (unresolvedNorms.length > 0) {
    const { data: aliases } = await supabase
      .from('ingredient_aliases')
      .select('normalized_alias, ingredient_id')
      .in('normalized_alias', unresolvedNorms);
    for (const a of aliases ?? []) {
      aliasByNorm.set(a.normalized_alias as string, a.ingredient_id as string);
    }
  }

  const resolved = new Map<string, string>(); // normalizeName(input) -> ingredient_id
  const resolveKnown = () => {
    for (const i of ingredients) {
      const n = normalizeName(i.name);
      const id = exactByNorm.get(n) ?? aliasByNorm.get(n);
      if (id) resolved.set(n, id);
    }
  };

  // (3) Fast-path: todo resuelto por exacto o caché -> sin IA.
  if (norms.every((n) => exactByNorm.has(n) || aliasByNorm.has(n))) {
    resolveKnown();
    return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
  }

  // Catálogo canónico como vocabulario del resolver + índice normalized_name -> id de canónicos.
  const { data: canon } = await supabase
    .from('ingredients')
    .select('id, name, category, normalized_name')
    .is('canonical_id', null);
  const canonList = (canon ?? []) as {
    id: string;
    name: string;
    category: string;
    normalized_name: string;
  }[];
  const canonByNorm = new Map<string, string>(canonList.map((c) => [c.normalized_name, c.id]));

  // Solo los nombres que no resuelven por exacto ni caché van a la IA.
  const seenAi = new Set<string>();
  const namesForAi: string[] = [];
  for (const i of ingredients) {
    const n = normalizeName(i.name);
    if (!n || exactByNorm.has(n) || aliasByNorm.has(n) || seenAi.has(n)) continue;
    seenAi.add(n);
    namesForAi.push(i.name);
  }

  let items: ResolvedIngredient[];
  try {
    items = await resolveIngredients(
      namesForAi,
      canonList.map((c) => ({ name: c.name, category: c.category })),
    );
  } catch (e) {
    // Fallback: exacto + caché; el resto sin enlazar. Nunca 'Otros'.
    console.error('resolveIngredients:', e);
    resolveKnown();
    return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
  }

  // input normalizado -> canonical_name normalizado; y set de canónicos nuevos a crear.
  const inputToCanon = new Map<string, string>();
  const toCreate = new Map<string, { name: string; category: string }>();
  for (const it of items) {
    const inputNorm = normalizeName(it.input);
    const canonNorm = normalizeName(it.canonical_name);
    if (!inputNorm || !canonNorm) continue;
    inputToCanon.set(inputNorm, canonNorm);
    if (canonByNorm.has(canonNorm)) continue; // el canónico ya existe
    if (!CATALOG_CATEGORIES.includes(it.category)) continue; // categoría inválida -> no crear
    if (!toCreate.has(canonNorm)) {
      toCreate.set(canonNorm, { name: it.canonical_name.trim(), category: it.category });
    }
  }

  // Crear los nuevos canónicos (canonical_id null), idempotente por normalized_name.
  if (toCreate.size > 0) {
    const rows = [...toCreate.entries()].map(([norm, v]) => ({
      name: v.name,
      normalized_name: norm,
      category: v.category,
      canonical_id: null,
    }));
    await supabase
      .from('ingredients')
      .upsert(rows, { onConflict: 'normalized_name', ignoreDuplicates: true });
    const { data: created } = await supabase
      .from('ingredients')
      .select('id, normalized_name')
      .in('normalized_name', [...toCreate.keys()]);
    for (const r of created ?? []) canonByNorm.set(r.normalized_name, r.id);
  }

  // Resolver cada ingrediente: exacto -> caché -> canónico de la IA.
  for (const i of ingredients) {
    const inputNorm = normalizeName(i.name);
    if (exactByNorm.has(inputNorm)) {
      resolved.set(inputNorm, exactByNorm.get(inputNorm)!);
      continue;
    }
    if (aliasByNorm.has(inputNorm)) {
      resolved.set(inputNorm, aliasByNorm.get(inputNorm)!);
      continue;
    }
    const canonNorm = inputToCanon.get(inputNorm);
    if (canonNorm && canonByNorm.has(canonNorm)) {
      resolved.set(inputNorm, canonByNorm.get(canonNorm)!);
    }
  }

  // Cachear en ingredient_aliases los nombres recién resueltos por IA (no los ya conocidos).
  const newAliases = new Map<string, string>();
  for (const i of ingredients) {
    const inputNorm = normalizeName(i.name);
    if (!inputNorm || exactByNorm.has(inputNorm) || aliasByNorm.has(inputNorm)) continue;
    const id = resolved.get(inputNorm);
    if (id) newAliases.set(inputNorm, id);
  }
  if (newAliases.size > 0) {
    await supabase.from('ingredient_aliases').upsert(
      [...newAliases].map(([normalized_alias, ingredient_id]) => ({ normalized_alias, ingredient_id })),
      { onConflict: 'normalized_alias', ignoreDuplicates: true },
    );
  }

  return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
}

// Embedding representativo de la receta (mismo texto que usa el índice semántico).
export async function recipeEmbedding(recipe: RecipeData): Promise<number[]> {
  return embedText(embeddingText(recipe), 'RETRIEVAL_DOCUMENT');
}

export interface SaveOptions {
  // Reutiliza un embedding ya calculado (evita re-embeddear cuando el llamador ya lo hizo,
  // p. ej. index-recipe para el dedup).
  embedding?: number[];
  // Imagen diferida: image_status='none' aunque sea reusable, y el llamador NO encola imagen.
  // La generación on-demand (ensure-recipe-image) la crea al abrir la receta.
  deferImage?: boolean;
}

export async function saveRecipe(
  supabase: SupabaseClient,
  recipe: RecipeData,
  options: SaveOptions = {},
) {
  const embedding = options.embedding ?? (await recipeEmbedding(recipe));
  const ingredients = await withIngredientIds(supabase, recipe.ingredients ?? []);
  const reusable = recipe.reusable ?? true;
  const imageStatus = options.deferImage ? 'none' : reusable ? 'pending' : 'none';
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
      meal_types: recipe.meal_types ?? [],
      ingredients,
      steps: recipe.steps ?? [],
      reusable,
      image_status: imageStatus,
      embedding,
    })
    .select(RETURN_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
