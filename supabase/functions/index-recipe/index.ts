import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { persistRecipeSeasonProfile } from '../_shared/recipe-seasons.ts';
import { recipeEmbedding, saveRecipe, type RecipeData } from '../_shared/recipes.ts';

// Umbral de similitud coseno para considerar dos recetas del catálogo el "mismo plato".
const DEDUP_THRESHOLD = Number(Deno.env.get('SEED_DEDUP_THRESHOLD') ?? '0.9');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Endpoint interno (siembra + orquestación de generación): protegido por secreto.
  if (!hasInternalSecret(req)) return json({ error: 'No autorizado.' }, 401);

  const recipe = (await req.json().catch(() => ({}))) as RecipeData;
  if (!recipe?.title) return json({ error: 'Falta el campo "title".' }, 400);

  try {
    const supabase = serviceClient();
    // Embeddea una vez: sirve para el dedup y para guardar (sin re-embeddear).
    const embedding = await recipeEmbedding(recipe);

    const { data: similar, error: simError } = await supabase.rpc('find_similar_recipe', {
      query_embedding: embedding,
      match_threshold: DEDUP_THRESHOLD,
    });
    if (simError) throw simError;
    const existing = similar?.[0];
    if (existing) {
      await persistRecipeSeasonProfile(supabase, existing.id, recipe.seasonProfile);
      return json({ deduped: true, recipe: existing });
    }

    // Imagen diferida: no se encola aquí; se genera on-demand al abrir la receta.
    const saved = await saveRecipe(supabase, recipe, { embedding, deferImage: true });
    return json({ deduped: false, recipe: saved });
  } catch (e) {
    console.error('index-recipe:', e);
    return json({ error: 'No se pudo guardar la receta.' }, 500);
  }
});
