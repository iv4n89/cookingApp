import { supabase } from './supabase';

export interface UserRecipeMeta {
  is_favorite: boolean;
  rating: number | null;
}

export interface FavoriteRecipe {
  id: string;
  title: string;
  image_url: string | null;
  prep_time_min: number;
  cook_time_min: number;
  tags: string[];
  rating: number | null;
}

export async function getUserRecipe(recipeId: string): Promise<UserRecipeMeta> {
  const { data, error } = await supabase
    .from('user_recipes')
    .select('is_favorite, rating')
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) throw error;
  return { is_favorite: data?.is_favorite ?? false, rating: data?.rating ?? null };
}

async function upsertUserRecipe(userId: string, recipeId: string, patch: Partial<UserRecipeMeta>) {
  const { error } = await supabase.from('user_recipes').upsert(
    { user_id: userId, recipe_id: recipeId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,recipe_id' },
  );
  if (error) throw error;
}

export async function setFavorite(userId: string, recipeId: string, isFavorite: boolean) {
  await upsertUserRecipe(userId, recipeId, { is_favorite: isFavorite });
}

export async function setRating(userId: string, recipeId: string, rating: number | null) {
  await upsertUserRecipe(userId, recipeId, { rating });
}

export async function listFavorites(): Promise<FavoriteRecipe[]> {
  const { data, error } = await supabase
    .from('user_recipes')
    .select('rating, recipe:recipes (id, title, image_url, prep_time_min, cook_time_min, tags)')
    .eq('is_favorite', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const recipe = row.recipe as unknown as Omit<FavoriteRecipe, 'rating'>;
    return { ...recipe, rating: row.rating };
  });
}
