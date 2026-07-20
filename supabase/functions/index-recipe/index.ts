import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { embedText } from '../_shared/gemini.ts';

interface Ingredient {
  name: string;
}

interface RecipeInput {
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
  ingredients?: Ingredient[];
  steps?: unknown[];
}

// Texto representativo de la receta para el embedding (lo que la hace "encontrable").
function embeddingText(recipe: RecipeInput): string {
  const ingredients = (recipe.ingredients ?? []).map((i) => i.name).join(', ');
  return [recipe.title, recipe.description ?? '', (recipe.tags ?? []).join(', '), ingredients]
    .filter(Boolean)
    .join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const recipe = (await req.json().catch(() => ({}))) as RecipeInput;
    if (!recipe?.title) return json({ error: 'Falta el campo "title".' }, 400);

    const embedding = await embedText(embeddingText(recipe), 'RETRIEVAL_DOCUMENT');

    const supabase = serviceClient();
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
      .select('id, title')
      .single();
    if (error) throw error;

    return json({ recipe: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
