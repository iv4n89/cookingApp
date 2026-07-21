import { getCatalogDefaults } from './ingredients';
import { supabase } from './supabase';

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
  servings: number;
  prep_time_min: number;
  cook_time_min: number;
  calories: number | null;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export type RecipeOrigin = 'db' | 'generated' | 'none';

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
  'id, title, description, source, source_url, image_url, servings, prep_time_min, cook_time_min, calories, tags, ingredients, steps';

// Pide una receta a la IA: busca una parecida ya guardada o la genera.
export async function askRecipe(query: string): Promise<{ recipe: Recipe | null; origin: RecipeOrigin }> {
  const { data, error } = await supabase.functions.invoke('search-recipe', { body: { query } });
  if (error) throw error;
  return data as { recipe: Recipe | null; origin: RecipeOrigin };
}

export interface RecommendedRecipe {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  prep_time_min: number;
  cook_time_min: number;
  tags: string[];
  match_count: number;
}

// Recetas que puedes cocinar con lo que tienes: ordenadas por ingredientes en despensa.
export async function recommendedRecipes(limit = 6): Promise<RecommendedRecipe[]> {
  const { data, error } = await supabase.rpc('recommended_recipes', { p_limit: limit });
  if (error) throw error;
  return (data as RecommendedRecipe[]) ?? [];
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipes').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Recipe | null) ?? null;
}

// Añade a la compra en unidades de compra: si el ingrediente está en el catálogo, usa su
// unidad y cantidad de referencia (default_unit/default_min_stock, p.ej. aceite -> 1 botella)
// en vez de la de la receta (1 cucharada). Si no, deja la de la receta.
export async function addIngredientsToShopping(userId: string, ingredients: RecipeIngredient[]) {
  const defaults = await getCatalogDefaults(ingredients.map((i) => i.ingredient_id ?? ''));
  const rows = ingredients.map((item) => {
    const preset = item.ingredient_id ? defaults.get(item.ingredient_id) : undefined;
    return {
      user_id: userId,
      name: item.name,
      quantity: preset?.min ?? item.quantity,
      unit: preset?.unit ?? item.unit,
      ingredient_id: item.ingredient_id ?? null,
    };
  });
  const { error } = await supabase.from('shopping_list_items').insert(rows);
  if (error) throw error;
}
