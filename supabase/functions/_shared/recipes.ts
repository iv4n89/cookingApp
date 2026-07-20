import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { embedText } from './gemini.ts';

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

export async function saveRecipe(supabase: SupabaseClient, recipe: RecipeData) {
  const embedding = await embedText(embeddingText(recipe), 'RETRIEVAL_DOCUMENT');
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
      ingredients: recipe.ingredients ?? [],
      steps: recipe.steps ?? [],
      embedding,
    })
    .select(RETURN_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
