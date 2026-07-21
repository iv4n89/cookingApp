import { getUserId, isAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { getUserPrefs, resolveRecipe } from '../_shared/recipe-pipeline.ts';

// Tope de longitud de la consulta (acota coste de embedding + generación).
const MAX_QUERY_LENGTH = 300;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isAuthenticatedUser(req)) return json({ error: 'No autorizado.' }, 401);

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim()) {
    return json({ error: 'Falta el campo "query".' }, 400);
  }
  const text = query.trim();
  if (text.length > MAX_QUERY_LENGTH) {
    return json({ error: 'La consulta es demasiado larga.' }, 400);
  }

  try {
    const supabase = serviceClient();
    const userId = getUserId(req);
    const prefs = userId ? await getUserPrefs(supabase, userId) : null;
    const { recipe, origin } = await resolveRecipe(supabase, text, userId, prefs);
    if (origin === 'rate_limited') {
      return json({ error: 'Has creado muchas recetas nuevas en poco tiempo. Prueba más tarde.' }, 429);
    }
    return json({ recipe, origin });
  } catch (e) {
    console.error('search-recipe:', e);
    return json({ error: 'No se pudo procesar la búsqueda.' }, 500);
  }
});
