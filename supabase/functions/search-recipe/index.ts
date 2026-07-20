import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { embedText } from '../_shared/gemini.ts';

// Umbral de similitud coseno para reutilizar una receta existente.
// Calibrado con embeddings de gemini-embedding-001 (768, normalizados): las
// consultas relacionadas rondan 0.71-0.75 y el ruido cae por debajo de 0.55.
const MATCH_THRESHOLD = 0.65;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { query } = await req.json().catch(() => ({}));
    if (typeof query !== 'string' || !query.trim()) {
      return json({ error: 'Falta el campo "query".' }, 400);
    }

    const embedding = await embedText(query.trim(), 'RETRIEVAL_QUERY');

    const supabase = serviceClient();
    const { data, error } = await supabase.rpc('match_recipes', {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: 1,
    });
    if (error) throw error;

    const recipe = data?.[0] ?? null;
    return json({ recipe, origin: recipe ? 'db' : 'none' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
