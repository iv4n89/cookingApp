import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { queueRecipeImage } from '../_shared/recipe-image.ts';
import { saveRecipe, type RecipeData } from '../_shared/recipes.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Endpoint interno (siembra + orquestación de generación): protegido por secreto.
  if (!hasInternalSecret(req)) return json({ error: 'No autorizado.' }, 401);

  const recipe = (await req.json().catch(() => ({}))) as RecipeData;
  if (!recipe?.title) return json({ error: 'Falta el campo "title".' }, 400);

  try {
    const supabase = serviceClient();
    const saved = await saveRecipe(supabase, recipe);
    // Imagen en segundo plano (fal.ai), igual que el flujo on-demand. Las semillas son
    // reutilizables, así que sí reciben imagen.
    queueRecipeImage(supabase, saved?.id, saved?.title);
    return json({ recipe: saved });
  } catch (e) {
    console.error('index-recipe:', e);
    return json({ error: 'No se pudo guardar la receta.' }, 500);
  }
});
