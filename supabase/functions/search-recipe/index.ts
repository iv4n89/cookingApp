import { isAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { embedText, generateRecipe } from '../_shared/gemini.ts';
import { saveRecipe } from '../_shared/recipes.ts';

// Umbral de similitud coseno para reutilizar una receta existente.
// Calibrado con embeddings de gemini-embedding-001 (768, normalizados): las
// consultas relacionadas rondan 0.71-0.75 y el ruido cae por debajo de 0.55.
const MATCH_THRESHOLD = 0.65;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isAuthenticatedUser(req)) return json({ error: 'No autorizado.' }, 401);

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim()) {
    return json({ error: 'Falta el campo "query".' }, 400);
  }
  const text = query.trim();

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

    // 2) Si no hay match, generar con Gemini y guardar para reutilizar.
    const generated = await generateRecipe(text);
    const saved = await saveRecipe(supabase, { ...generated, source: 'generated' });
    return json({ recipe: saved, origin: 'generated' });
  } catch (e) {
    console.error('search-recipe:', e);
    return json({ error: 'No se pudo procesar la búsqueda.' }, 500);
  }
});
