import { embedText, generateRecipe } from './gemini.ts';
import { excludedAllergens, requiredDiet } from './preferences.ts';
import { queueRecipeImage } from './recipe-image.ts';
import { recipeFromGenerated, saveRecipe } from './recipes.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

export type RecipeOrigin = 'db' | 'generated' | 'rate_limited';

// Restricciones ad-hoc de la conversación (además de las preferencias guardadas).
export interface Constraints {
  excludeAllergens?: string[];
  requireDiet?: string[];
  // Cocinar solo con lo que hay en casa: si true y `pantry` viene, la generación se restringe
  // a esos ingredientes (más básicos).
  pantryOnly?: boolean;
  pantry?: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// Flujo único de recetas: caché (filtrada por preferencias) -> web + IA -> guardar.
// Lo usan tanto la búsqueda directa como el chat, para que ninguna receta sea "inventada"
// suelta: siempre queda guardada, atribuida y etiquetada.
export interface ResolveOptions {
  // El chat pasa true: la caché semántica no distingue modificaciones ("con/sin huevo",
  // "más picante"), así que en conversación se genera siempre fresco para que la receta
  // refleje exactamente lo pedido. La búsqueda del Home (una sola tirada) sí reutiliza.
  skipCache?: boolean;
}

export async function resolveRecipe(
  supabase: SupabaseClient,
  query: string,
  userId: string | null,
  prefs: UserPrefs | null,
  constraints: Constraints = {},
  options: ResolveOptions = {},
): Promise<{ recipe: Record<string, unknown> | null; origin: RecipeOrigin }> {
  const exclude_allergens = unique([
    ...(prefs ? await excludedAllergens(supabase, prefs.special_needs) : []),
    ...(constraints.excludeAllergens ?? []),
  ]);
  const require_diet = unique([
    ...(prefs ? await requiredDiet(supabase, prefs.food_prefs) : []),
    ...(constraints.requireDiet ?? []),
  ]);

  if (!options.skipCache) {
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
  }

  if (userId && (await generationsInWindow(supabase, userId)) >= MAX_GENERATIONS_PER_WINDOW) {
    return { recipe: null, origin: 'rate_limited' };
  }

  const guidance = [prefs ? buildPrefText(prefs) : undefined];
  if (constraints.excludeAllergens?.length) {
    guidance.push(
      `Evita por completo estos ingredientes y sus derivados: ${constraints.excludeAllergens.join(', ')}.`,
    );
  }
  if (constraints.requireDiet?.length) {
    guidance.push(`La receta debe cumplir esta dieta: ${constraints.requireDiet.join(', ')}.`);
  }
  if (constraints.pantryOnly && constraints.pantry?.length) {
    guidance.push(
      `IMPRESCINDIBLE: el usuario no puede comprar nada, cocina SOLO con lo que ya tiene. Usa ` +
        `únicamente ingredientes de esta lista (más básicos siempre disponibles: sal, pimienta, ` +
        `aceite, agua): ${constraints.pantry.join(', ')}. No incluyas ningún otro ingrediente.`,
    );
  }
  const guidanceText = guidance.filter(Boolean).join(' ') || undefined;

  const generated = await generateRecipe(query, guidanceText);
  const saved = await saveRecipe(supabase, {
    ...recipeFromGenerated(generated),
    reusable: !options.skipCache,
  });

  // Imagen de la receta en segundo plano SOLO para reutilizables (las del chat, reusable=false,
  // van con placeholder para no gastar en fal). No bloquea la respuesta.
  if (!options.skipCache) queueRecipeImage(supabase, saved?.id, saved?.title);

  if (userId) {
    try {
      const { error: eventError } = await supabase.from('generation_events').insert({ user_id: userId });
      if (eventError) console.error('generation_events insert falló:', eventError);
    } catch (e) {
      console.error('generation_events insert falló:', e);
    }
  }

  return { recipe: saved, origin: 'generated' };
}
