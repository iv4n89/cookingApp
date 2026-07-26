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
  // Ingredientes que el usuario ha pedido expresamente. Una receta del catálogo que no los lleve
  // no vale, por muy bien que encaje con su despensa.
  requiredIngredients?: string[];
}

interface RankedCandidate {
  recipeId: string;
  score?: { missingIngredientCount?: number };
  missingIngredients?: { name?: string }[];
}

// Palabras que no distinguen un ingrediente de otro, para que "palitos de cangrejo" case con
// "cangrejo" sin que "de" cuente.
const FILLER_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'al', 'con', 'en', 'y']);

function significantWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !FILLER_WORDS.has(word));
}

function covers(words: string[], other: string[]): boolean {
  return other.length > 0 && other.every((word) => words.includes(word));
}

// Una receta sirve si cada ingrediente pedido aparece en su lista. Se comparan palabras completas
// y en ambos sentidos: "cangrejo" casa con "palitos de cangrejo" y al revés, pero "pan" no casa
// con "panceta", que es lo que pasaría comparando subcadenas.
export function hasRequestedIngredients(
  recipe: Record<string, unknown>,
  required: string[],
): boolean {
  const names = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((item) =>
    significantWords(String((item as { name?: unknown })?.name ?? '')),
  );
  return required.every((wanted) => {
    const target = significantWords(wanted);
    if (!target.length) return true;
    return names.some((name) => covers(name, target) || covers(target, name));
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// Genera una receta con IA a partir de la petición y las restricciones, la guarda y (si es
// reutilizable) le encola imagen. Compartido por la búsqueda del Home y el fallback del chat.
async function generateAndSave(
  supabase: SupabaseClient,
  query: string,
  userId: string | null,
  prefs: UserPrefs | null,
  constraints: Constraints,
  reusable: boolean,
): Promise<{ recipe: Record<string, unknown> | null; origin: RecipeOrigin }> {
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
  } else if (constraints.pantry?.length) {
    // Guía blanda: aprovechar la despensa para minimizar lo que hay que comprar.
    guidance.push(
      `El usuario tiene en casa: ${constraints.pantry.join(', ')}. Prioriza usar estos ` +
        `ingredientes y minimiza los que habría que comprar.`,
    );
  }
  const guidanceText = guidance.filter(Boolean).join(' ') || undefined;

  const generated = await generateRecipe(query, guidanceText);
  const saved = await saveRecipe(supabase, {
    ...recipeFromGenerated(generated),
    reusable,
  });

  // Imagen de la receta en segundo plano SOLO para reutilizables (las del chat, reusable=false,
  // van con placeholder para no gastar en fal). No bloquea la respuesta.
  if (reusable) queueRecipeImage(supabase, saved?.id, saved?.title);

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
  const [prefAllergens, prefDiet] = prefs
    ? await Promise.all([
        excludedAllergens(supabase, prefs.special_needs),
        requiredDiet(supabase, prefs.food_prefs),
      ])
    : [[], []];
  const exclude_allergens = unique([...prefAllergens, ...(constraints.excludeAllergens ?? [])]);
  const require_diet = unique([...prefDiet, ...(constraints.requireDiet ?? [])]);

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

  return generateAndSave(supabase, query, userId, prefs, constraints, !options.skipCache);
}

// Resolución de receta para el CHAT: catálogo-primero con ranking por despensa. Busca en el
// catálogo (match_recipes) las recetas más afines a la petición, las rankea contra la despensa del
// hogar (RPC household_recipe_ranking, mismo motor pantry-first que la Home) y devuelve la más
// cocinable, con la lista de ingredientes que faltan. Si no hay ninguna afín, genera con IA
// pasando la despensa como guía. Las modificaciones ("sin huevo", "más picante") NO usan esto: el
// chat las manda por resolveRecipe con skipCache para que reflejen lo pedido.
export async function resolveRecipeForChat(
  supabase: SupabaseClient,
  query: string,
  userId: string | null,
  householdId: string | null,
  prefs: UserPrefs | null,
  constraints: Constraints = {},
): Promise<{ recipe: Record<string, unknown> | null; origin: RecipeOrigin; missing: string[] }> {
  const [prefAllergens, prefDiet] = prefs
    ? await Promise.all([
        excludedAllergens(supabase, prefs.special_needs),
        requiredDiet(supabase, prefs.food_prefs),
      ])
    : [[], []];
  const exclude_allergens = unique([...prefAllergens, ...(constraints.excludeAllergens ?? [])]);
  const require_diet = unique([...prefDiet, ...(constraints.requireDiet ?? [])]);

  // Catálogo-primero: solo tiene sentido con un hogar del que leer la despensa.
  if (householdId) {
    const embedding = await embedText(query, 'RETRIEVAL_QUERY');
    const { data: matches, error } = await supabase.rpc('match_recipes', {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: 12,
      exclude_allergens,
      require_diet,
    });
    if (error) throw error;

    // Lo que el usuario pidió manda sobre lo que tiene en casa: si ninguna receta del catálogo
    // lleva esos ingredientes, se genera una en vez de ofrecerle otra cosa.
    const required = constraints.requiredIngredients ?? [];
    const eligible = required.length
      ? (matches ?? []).filter((m: Record<string, unknown>) => hasRequestedIngredients(m, required))
      : (matches ?? []);

    if (eligible.length) {
      const ids = eligible.map((m: { id?: string }) => m.id).filter(Boolean);
      const { data: ranking, error: rankError } = await supabase.rpc('household_recipe_ranking', {
        p_household_id: householdId,
        p_user_id: userId,
        p_recipe_ids: ids,
        p_limit: 12,
      });
      // Si el ranking falla, degradar a generación en vez de romper la respuesta.
      if (!rankError) {
        const candidates = (ranking?.candidates ?? []) as RankedCandidate[];
        // El ranking ordena por despensa, que es lo que se quiere cuando el usuario pide ideas
        // sin concretar. Si pidió ingredientes, manda el parecido con su petición y la despensa
        // solo sirve para saber qué le falta.
        const byRequest: RankedCandidate[] = required.length
          ? eligible
              .map((m: { id?: string }) => candidates.find((c) => c.recipeId === m.id))
              .filter((c: RankedCandidate | undefined): c is RankedCandidate => Boolean(c))
          : candidates;
        // "Solo con lo que tengo": exige una candidata sin faltantes; si no, se genera.
        const best = constraints.pantryOnly
          ? byRequest.find((c) => (c.score?.missingIngredientCount ?? 1) === 0)
          : byRequest[0];
        if (best) {
          const recipe = eligible.find((m: { id?: string }) => m.id === best.recipeId) ?? null;
          if (recipe) {
            const missing = (best.missingIngredients ?? [])
              .map((mi) => mi?.name)
              .filter((n): n is string => Boolean(n));
            return { recipe, origin: 'db', missing };
          }
        }
      } else {
        console.error('household_recipe_ranking falló, se degrada a generación:', rankError);
      }
    }
  }

  const generated = await generateAndSave(supabase, query, userId, prefs, constraints, false);
  return { ...generated, missing: [] };
}
