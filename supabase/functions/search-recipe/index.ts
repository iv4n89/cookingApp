import { getUserId, isAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { embedText, generateRecipe } from '../_shared/gemini.ts';
import { recipeFromGenerated, saveRecipe } from '../_shared/recipes.ts';
import { searchWeb } from '../_shared/tavily.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Umbral de similitud coseno para reutilizar una receta existente.
// Calibrado con embeddings de gemini-embedding-001 (768, normalizados): las
// consultas relacionadas rondan 0.71-0.75 y el ruido cae por debajo de 0.55.
const MATCH_THRESHOLD = 0.65;

// Tope de longitud de la consulta (acota coste de embedding + generación).
const MAX_QUERY_LENGTH = 300;

// Rate-limit de generación por usuario (acota coste de LLM + búsqueda web).
const MAX_GENERATIONS_PER_WINDOW = 10;
const WINDOW_MS = 60 * 60 * 1000;

async function generationsInWindow(supabase: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  return count ?? 0;
}

// Directivas de personalización a partir de las preferencias del usuario.
async function userPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('user_preferences')
    .select('food_prefs, special_needs, notes')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return undefined;

  const parts: string[] = [];
  if (data.food_prefs?.length) {
    parts.push(`Preferencias de comida del usuario (tenlas en cuenta): ${data.food_prefs.join(', ')}.`);
  }
  if (data.special_needs?.length) {
    parts.push(
      `IMPRESCINDIBLE respetar estas necesidades del usuario; evita por completo esos ingredientes y sus derivados: ${data.special_needs.join(', ')}.`,
    );
  }
  const notes = (data.notes ?? '').trim().slice(0, 500);
  if (notes) parts.push(`Notas del usuario: ${notes}`);

  return parts.length ? parts.join(' ') : undefined;
}

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

    // 1) Buscar una receta parecida ya guardada.
    const embedding = await embedText(text, 'RETRIEVAL_QUERY');
    const { data, error } = await supabase.rpc('match_recipes', {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: 1,
    });
    if (error) throw error;

    const match = data?.[0];
    if (match) return json({ recipe: match, origin: 'db' });

    // 2) Sin match: generar es costoso (LLM + web), así que se limita por usuario.
    const userId = getUserId(req);
    if (userId && (await generationsInWindow(supabase, userId)) >= MAX_GENERATIONS_PER_WINDOW) {
      return json({ error: 'Has creado muchas recetas nuevas en poco tiempo. Prueba más tarde.' }, 429);
    }

    // Buscar en la web (contexto + atribución), generar y guardar.
    const results = await searchWeb(text);
    const context = results
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n')
      .slice(0, 4000);
    const sourceUrl = results[0]?.url ?? null;

    const preferences = userId ? await userPreferences(supabase, userId) : undefined;
    const generated = await generateRecipe(text, context || undefined, preferences);
    const saved = await saveRecipe(supabase, recipeFromGenerated(generated, sourceUrl));

    // El registro del evento es best-effort: un fallo aquí no debe convertir una
    // generación ya exitosa (y guardada) en un error para el usuario.
    if (userId) {
      try {
        const { error: eventError } = await supabase
          .from('generation_events')
          .insert({ user_id: userId });
        if (eventError) console.error('generation_events insert falló:', eventError);
      } catch (e) {
        console.error('generation_events insert falló:', e);
      }
    }

    return json({ recipe: saved, origin: sourceUrl ? 'web' : 'generated' });
  } catch (e) {
    console.error('search-recipe:', e);
    return json({ error: 'No se pudo procesar la búsqueda.' }, 500);
  }
});
