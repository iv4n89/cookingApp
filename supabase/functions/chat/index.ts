import { getUserId, isAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { generateChat, type ChatTurn } from '../_shared/gemini.ts';
import { ALLERGEN_KEYS, DIET_KEYS, sanitizeKeys } from '../_shared/preferences.ts';
import { getUserPrefs, resolveRecipe, type UserPrefs } from '../_shared/recipe-pipeline.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Acota coste y contexto: solo los últimos mensajes y un tope por mensaje.
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 2000;
const MAX_RECIPE_INGREDIENTS = 40;
const MAX_RECIPE_STEPS = 25;
const MAX_RECIPE_CONTEXT_LENGTH = 1500;
const MAX_QUERY_LENGTH = 300;

interface HistoryRecipe {
  title?: string;
  ingredients?: { name?: string; quantity?: unknown; unit?: string }[];
  steps?: { instruction?: string }[];
}

interface InMessage {
  role: 'user' | 'assistant';
  content: string;
  recipe?: HistoryRecipe | null;
}

const BASE_PROMPT =
  'Eres el asistente de cocina de RecetasApp. Hablas español con un tono natural, cercano y directo, ' +
  'sin exageraciones ni halagos vacíos: no empieces con "¡Buena idea!", "¡Excelente elección!" ni ' +
  'exclamaciones por defecto. Sé amable pero ve al grano, en texto plano (sin markdown).\n' +
  'Devuelve SIEMPRE "message" con tu respuesta conversacional.\n' +
  'No inventes recetas. Cuando el usuario pida una receta o quiera adaptar/cambiar la actual, NO ' +
  'escribas la receta: rellena "recipe_query" con una frase de búsqueda breve y autocontenida que ' +
  'describa el plato deseado teniendo en cuenta toda la conversación (por ejemplo "salteado de patata ' +
  'con mantequilla, ajo y cebolla"). El sistema buscará o creará la receta real. En "message" coméntalo ' +
  'brevemente (por ejemplo "Te busco una versión con cebolla"). Si el usuario no pide receta, deja ' +
  '"recipe_query" vacío.\n' +
  'Si en la conversación el usuario pide EVITAR algún ingrediente que sea uno de estos alérgenos, ' +
  'ponlo en "exclude_allergens" con su clave exacta: egg (huevo), milk (leche/lácteos/queso/nata), ' +
  'nuts (frutos secos), peanut (cacahuete), gluten, fish (pescado), crustaceans y molluscs (marisco), ' +
  'soy (soja), sesame (sésamo), mustard (mostaza), celery (apio), fructose, histamine, sorbitol, ' +
  'pork (cerdo), alcohol. Ejemplo: "sin huevo" -> ["egg"]. Si pide vegano o vegetariano, ponlo en ' +
  '"require_diet" (vegan o vegetarian). Deja ambos vacíos si no aplica.\n' +
  'No des consejo médico ni nutricional profesional.';

// Texto de la receta para que el modelo recuerde lo propuesto en turnos anteriores.
// Defensivo y acotado: el recipe viene del body del cliente (puede venir malformado o enorme).
function recipeContext(recipe: HistoryRecipe): string {
  const title = typeof recipe?.title === 'string' ? recipe.title : '';
  const ingredients = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
    .slice(0, MAX_RECIPE_INGREDIENTS)
    .map((i) => [i?.quantity != null ? String(i.quantity) : '', i?.unit, i?.name].filter(Boolean).join(' '))
    .join('; ');
  const steps = (Array.isArray(recipe?.steps) ? recipe.steps : [])
    .slice(0, MAX_RECIPE_STEPS)
    .map((s, i) => `${i + 1}. ${s?.instruction ?? ''}`)
    .join(' ');
  return `\n\n[Receta actual — ${title}. Ingredientes: ${ingredients}. Pasos: ${steps}]`.slice(
    0,
    MAX_RECIPE_CONTEXT_LENGTH,
  );
}

// Contexto siempre activo del usuario: necesidades (a respetar), preferencias y despensa.
async function buildSystemInstruction(
  supabase: SupabaseClient,
  userId: string | null,
  prefs: UserPrefs | null,
): Promise<string> {
  if (!userId) return BASE_PROMPT;

  const { data: pantry } = await supabase.from('pantry_items').select('name').eq('user_id', userId).limit(100);

  const parts = [BASE_PROMPT];
  if (prefs?.special_needs.length) {
    parts.push(
      `Necesidades del usuario que debes respetar SIEMPRE, evitando esos ingredientes y sus derivados: ${prefs.special_needs.join(', ')}.`,
    );
  }
  if (prefs?.food_prefs.length) {
    parts.push(`Preferencias del usuario: ${prefs.food_prefs.join(', ')}.`);
  }
  const notes = (prefs?.notes ?? '').trim().slice(0, 500);
  if (notes) parts.push(`Notas del usuario: ${notes}`);
  if (pantry?.length) {
    parts.push(
      `Ingredientes que el usuario tiene en su despensa: ${pantry.map((p) => p.name).join(', ')}. ` +
        `Prioriza recetas que aprovechen lo que ya tiene.`,
    );
  }
  return parts.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isAuthenticatedUser(req)) return json({ error: 'No autorizado.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { messages?: InMessage[] };
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages?.length) return json({ error: 'Faltan mensajes.' }, 400);

  const turns: ChatTurn[] = messages
    .slice(-MAX_MESSAGES)
    .filter(
      (m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'),
    )
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      text:
        m.content.slice(0, MAX_CONTENT_LENGTH) +
        (m.role === 'assistant' && m.recipe ? recipeContext(m.recipe) : ''),
    }));
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    return json({ error: 'El último mensaje debe ser del usuario.' }, 400);
  }

  try {
    const supabase = serviceClient();
    const userId = getUserId(req);
    const prefs = userId ? await getUserPrefs(supabase, userId) : null;
    const system = await buildSystemInstruction(supabase, userId, prefs);

    const { message, recipe_query, exclude_allergens, require_diet } = await generateChat(turns, system);

    // La receta no la inventa el chat: se resuelve por el pipeline real (caché/web/IA),
    // aplicando también las restricciones que el usuario pide en la conversación.
    let recipe: Record<string, unknown> | null = null;
    const query = typeof recipe_query === 'string' ? recipe_query.trim() : '';
    if (query) {
      const resolved = await resolveRecipe(supabase, query.slice(0, MAX_QUERY_LENGTH), userId, prefs, {
        excludeAllergens: sanitizeKeys(exclude_allergens ?? undefined, ALLERGEN_KEYS),
        requireDiet: sanitizeKeys(require_diet ?? undefined, DIET_KEYS),
      });
      recipe = resolved.recipe;
    }

    return json({ message, recipe });
  } catch (e) {
    console.error('chat:', e);
    return json({ error: 'No se pudo responder.' }, 500);
  }
});
