import type { CookDelta } from './pantry-match';
import { supabase } from './supabase';

export interface CookedEntry {
  id: string;
  title: string;
  servings: number;
  cooked_at: string;
}

// Marca la receta como cocinada y descuenta de la despensa los items indicados.
// El matching (por nombre/id) se calcula en el cliente; la RPC solo aplica los deltas.
export async function cookRecipe(recipeId: string, servings: number, deltas: CookDelta[]) {
  const { error } = await supabase.rpc('apply_cook', {
    p_recipe_id: recipeId,
    p_servings: servings,
    p_deltas: deltas,
  });
  if (error) throw error;
}

export async function listCooked(): Promise<CookedEntry[]> {
  const { data, error } = await supabase
    .from('cooked_recipes')
    .select('id, title, servings, cooked_at')
    .order('cooked_at', { ascending: false });
  if (error) throw error;
  return (data as CookedEntry[]) ?? [];
}

// Deshace: restaura los ingredientes a la despensa y borra la entrada.
export async function uncookRecipe(cookedId: string) {
  const { error } = await supabase.rpc('uncook_recipe', { p_cooked_id: cookedId });
  if (error) throw error;
}
