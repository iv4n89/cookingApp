import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { saveRecipe, type RecipeData } from '../_shared/recipes.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Endpoint interno (siembra + orquestación de generación): protegido por secreto.
  if (!hasInternalSecret(req)) return json({ error: 'No autorizado.' }, 401);

  const recipe = (await req.json().catch(() => ({}))) as RecipeData;
  if (!recipe?.title) return json({ error: 'Falta el campo "title".' }, 400);

  try {
    const saved = await saveRecipe(serviceClient(), recipe);
    return json({ recipe: saved });
  } catch (e) {
    console.error('index-recipe:', e);
    return json({ error: 'No se pudo guardar la receta.' }, 500);
  }
});
