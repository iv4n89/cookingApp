import { embedText, generateRecipe } from './gemini.ts';
import { excludedAllergens, requiredDiet } from './preferences.ts';
import { generateRecipeImage } from './recipe-image.ts';
import { recipeFromGenerated, saveRecipe } from './recipes.ts';
import { searchWeb } from './tavily.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Global del edge runtime de Supabase para trabajo en segundo plano tras responder.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

// Umbral de similitud coseno para reutilizar una receta existente (gemini-embedding-001, 768).
export const MATCH_THRESHOLD = 0.65;

// Rate-limit de generación por usuario (acota coste de LLM + búsqueda web).
const MAX_GENERATIONS_PER_WINDOW = 10;
const WINDOW_MS = 60 * 60 * 1000;

export interface UserPrefs {
  food_prefs: string[];
  special_needs: string[];
  notes: string;
}

export async function getUserPrefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPrefs | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select('food_prefs, special_needs, notes')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    food_prefs: data.food_prefs ?? [],
    special_needs: data.special_needs ?? [],
    notes: data.notes ?? '',
  };
}

// Directivas de personalización para la generación a partir de las preferencias.
export function buildPrefText(prefs: UserPrefs): string | undefined {
  const parts: string[] = [];
  if (prefs.food_prefs.length) {
    parts.push(`Preferencias de comida del usuario (tenlas en cuenta): ${prefs.food_prefs.join(', ')}.`);
  }
  if (prefs.special_needs.length) {
    parts.push(
      `IMPRESCINDIBLE respetar estas necesidades del usuario; evita por completo esos ingredientes y sus derivados: ${prefs.special_needs.join(', ')}.`,
    );
  }
  const notes = prefs.notes.trim().slice(0, 500);
  if (notes) parts.push(`Notas del usuario: ${notes}`);
  return parts.length ? parts.join(' ') : undefined;
}

async function generationsInWindow(supabase: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  return count ?? 0;
}

export type RecipeOrigin = 'db' | 'web' | 'generated' | 'rate_limited';

// Flujo único de recetas: caché (filtrada por preferencias) -> web + IA -> guardar.
// Lo usan tanto la búsqueda directa como el chat, para que ninguna receta sea "inventada"
// suelta: siempre queda guardada, atribuida y etiquetada.
export async function resolveRecipe(
  supabase: SupabaseClient,
  query: string,
  userId: string | null,
  prefs: UserPrefs | null,
): Promise<{ recipe: Record<string, unknown> | null; origin: RecipeOrigin }> {
  const exclude_allergens = prefs ? excludedAllergens(prefs.special_needs) : [];
  const require_diet = prefs ? requiredDiet(prefs.food_prefs) : [];

  const embedding = await embedText(query, 'RETRIEVAL_QUERY');
  const { data, error } = await supabase.rpc('match_recipes', {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: 1,
    exclude_allergens,
    require_diet,
  });
  if (error) throw error;

  const match = data?.[0];
  if (match) return { recipe: match, origin: 'db' };

  if (userId && (await generationsInWindow(supabase, userId)) >= MAX_GENERATIONS_PER_WINDOW) {
    return { recipe: null, origin: 'rate_limited' };
  }

  const results = await searchWeb(query);
  const context = results
    .map((r) => `- ${r.title}: ${r.content}`)
    .join('\n')
    .slice(0, 4000);
  const sourceUrl = results[0]?.url ?? null;

  const generated = await generateRecipe(query, context || undefined, prefs ? buildPrefText(prefs) : undefined);
  const saved = await saveRecipe(supabase, recipeFromGenerated(generated, sourceUrl));

  // Imagen de la receta en segundo plano: no bloquea la respuesta y se guarda para el futuro.
  const savedId = saved?.id;
  const savedTitle = saved?.title;
  if (typeof savedId === 'string' && typeof savedTitle === 'string') {
    const task = generateRecipeImage(supabase, savedId, savedTitle).catch((e) =>
      console.error('recipe image:', e),
    );
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
  }

  if (userId) {
    try {
      const { error: eventError } = await supabase.from('generation_events').insert({ user_id: userId });
      if (eventError) console.error('generation_events insert falló:', eventError);
    } catch (e) {
      console.error('generation_events insert falló:', e);
    }
  }

  return { recipe: saved, origin: sourceUrl ? 'web' : 'generated' };
}
