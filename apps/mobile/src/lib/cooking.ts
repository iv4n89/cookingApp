import { supabase } from './supabase';

export interface CookedEntry {
  id: string;
  title: string;
  servings: number;
  cooked_at: string;
}

// Marca la receta como cocinada y descuenta los ingredientes de la despensa.
export async function cookRecipe(recipeId: string, servings: number) {
  const { error } = await supabase.rpc('cook_recipe', {
    p_recipe_id: recipeId,
    p_servings: servings,
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
