import { hasInternalSecret, isAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { queueRecipeImage } from '../_shared/recipe-image.ts';

// Encola bajo demanda la imagen de una receta ya guardada que no la tiene (p.ej. las del chat,
// que no se generan al crearse). Idempotente: no hace nada si ya hay imagen o se está generando.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // La app llama con el JWT del usuario; los scripts de backfill, con el secreto interno.
  if (!isAuthenticatedUser(req) && !hasInternalSecret(req)) {
    return json({ error: 'No autorizado.' }, 401);
  }

  // force: regenera aunque ya tenga imagen, para rehacer las que se hicieron con un prompt peor.
  // Sube al mismo objeto, así que la receta nunca se queda sin foto mientras se rehace.
  const { recipeId, force } = (await req.json().catch(() => ({}))) as {
    recipeId?: string;
    force?: boolean;
  };
  if (!recipeId) return json({ error: 'Falta recipeId.' }, 400);
  // Solo los scripts pueden forzar: sin esto, cualquier usuario con sesión podría encadenar
  // regeneraciones del catálogo y gastar fal sin límite, porque el resto de la función es idempotente.
  if (force && !hasInternalSecret(req)) {
    return json({ error: 'No autorizado a regenerar.' }, 403);
  }

  try {
    const supabase = serviceClient();
    const { data: recipe } = await supabase
      .from('recipes')
      .select('id, title, image_url, image_status')
      .eq('id', recipeId)
      .maybeSingle();
    if (!recipe) return json({ error: 'Receta no encontrada.' }, 404);

    if (!force) {
      if (recipe.image_url) return json({ image_status: 'ready' });
      if (recipe.image_status === 'pending') return json({ image_status: 'pending' });
    }

    await supabase.from('recipes').update({ image_status: 'pending' }).eq('id', recipeId);
    queueRecipeImage(supabase, recipe.id, recipe.title);
    return json({ image_status: 'pending' });
  } catch (e) {
    console.error('ensure-recipe-image:', e);
    return json({ error: 'No se pudo generar la imagen.' }, 500);
  }
});
