import { getCatalogDefaults } from './ingredients';
import { createIdempotencyKey } from './idempotency';
import { supabase } from './supabase';

import type { TodayDecision } from '@recetas/shared';

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  substitutions: string[];
  ingredient_id?: string | null;
}

export interface RecipeStep {
  order: number;
  instruction: string;
  timerSeconds: number | null;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  source: 'web' | 'generated';
  source_url: string | null;
  image_url: string | null;
  image_status: ImageStatus;
  servings: number;
  prep_time_min: number;
  cook_time_min: number;
  calories: number | null;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export type RecipeOrigin = 'db' | 'generated' | 'none';

export type ImageStatus = 'pending' | 'ready' | 'none';

export function formatQuantity(quantity: number | null): string {
  return quantity !== null ? String(Math.round(quantity * 100) / 100) : '';
}

// Escala las cantidades de los ingredientes al cambiar las raciones.
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  base: number,
  target: number,
): RecipeIngredient[] {
  const factor = target / (base > 0 ? base : 1);
  return ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: ingredient.quantity === null ? null : Math.round(ingredient.quantity * factor * 100) / 100,
  }));
}

const COLUMNS =
  'id, title, description, source, source_url, image_url, image_status, servings, prep_time_min, cook_time_min, calories, tags, ingredients, steps';

// Pide una receta a la IA: busca una parecida ya guardada o la genera.
export async function askRecipe(query: string): Promise<{ recipe: Recipe | null; origin: RecipeOrigin }> {
  const { data, error } = await supabase.functions.invoke('search-recipe', { body: { query } });
  if (error) throw error;
  return data as { recipe: Recipe | null; origin: RecipeOrigin };
}

export type MealType = 'desayuno' | 'almuerzo' | 'merienda' | 'cena';

// Decisión de hoy compuesta en backend: productos prioritarios, pista de despensa
// (destacada + alternativas) y pista de descubrimiento. `mealType` es la franja actual.
export async function todayDecision(mealType: MealType): Promise<TodayDecision | null> {
  const { data, error } = await supabase.rpc('household_today_decision', {
    p_meal_type: mealType,
    p_alternative_limit: 5,
  });
  if (error) throw error;
  return (data as TodayDecision) ?? null;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipes').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Recipe | null) ?? null;
}

// Añade a la compra en unidades de compra: si el ingrediente está en el catálogo, usa su
// unidad y cantidad de referencia (default_unit/default_min_stock, p.ej. aceite -> 1 botella)
// en vez de la de la receta (1 cucharada). Si no, deja la de la receta.
export async function addIngredientsToShopping(ingredients: RecipeIngredient[]) {
  const defaults = await getCatalogDefaults(ingredients.map((i) => i.ingredient_id ?? ''));
  await Promise.all(ingredients.map(async (item) => {
    const preset = item.ingredient_id ? defaults.get(item.ingredient_id) : undefined;
    const { error } = await supabase.rpc('add_shopping_item', {
      p_name: item.name,
      p_quantity: preset?.min ?? item.quantity,
      p_unit: preset?.unit ?? item.unit,
      p_ingredient_id: item.ingredient_id ?? null,
      p_recipe_id: null,
      p_idempotency_key: createIdempotencyKey(),
    });
    if (error) throw error;
  }));
}
