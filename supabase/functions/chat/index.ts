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

const RATE_LIMIT_MESSAGE =
  'Has creado muchas recetas nuevas en poco tiempo. Espera un rato y vuelve a pedírmela.';

const RECIPE_ERROR_NOTE = 'No he podido preparar la receta ahora mismo. Inténtalo de nuevo en un momento.';

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
  'Si el usuario pide IDEAS u OPCIONES de qué cocinar (por ejemplo "¿qué puedo cocinar con lo que ' +
  'tengo?", "dame ideas", "sugiéreme algo", "opciones"), NO rellenes "recipe_query": en su lugar ' +
  'rellena "suggestions" con 3 o 4 platos concretos y variados, aprovechando su despensa cuando ' +
  'aplique. Cada sugerencia lleva "title" (nombre del plato) y "hint" (pista corta con tiempo ' +
  'aproximado y tipo de comida o dificultad, por ejemplo "25 min · cena fácil"). En "message" ' +
  'invítale a elegir una. Cuando pida una receta concreta o elija una opción, usa "recipe_query" y ' +
  'deja "suggestions" vacío.\n' +
  'Si en la conversación el usuario pide EVITAR algún ingrediente que sea uno de estos alérgenos, ' +
  'ponlo en "exclude_allergens" con su clave exacta: egg (huevo), milk (leche/lácteos/queso/nata), ' +
  'nuts (frutos secos), peanut (cacahuete), gluten, fish (pescado), crustaceans y molluscs (marisco), ' +
  'soy (soja), sesame (sésamo), mustard (mostaza), celery (apio), fructose, histamine, sorbitol, ' +
  'pork (cerdo), alcohol. Ejemplo: "sin huevo" -> ["egg"]. Si pide vegano o vegetariano, ponlo en ' +
  '"require_diet" (vegan o vegetarian). Deja ambos vacíos si no aplica.\n' +
  'Si el usuario pide cocinar SOLO con lo que tiene en casa o dice que no puede/quiere comprar ' +
  '(por ejemplo "con lo que tenga", "no puedo salir a comprar", "sin ir a la tienda", "con lo que ' +
  'haya por casa"), pon "pantry_only" en true; si no, déjalo false. Cuando sea true, elige un plato ' +
  'realista con los ingredientes de su despensa.\n' +
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

async function fetchPantryNames(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('pantry_items').select('name').eq('user_id', userId).limit(100);
  return (data ?? []).map((p) => p.name as string).filter(Boolean);
}

// Contexto siempre activo del usuario: necesidades (a respetar), preferencias y despensa.
function buildSystemInstruction(prefs: UserPrefs | null, pantryNames: string[]): string {
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
  if (pantryNames.length) {
    parts.push(
      `Ingredientes que el usuario tiene en su despensa: ${pantryNames.join(', ')}. ` +
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
    const pantryNames = userId ? await fetchPantryNames(supabase, userId) : [];
    const system = buildSystemInstruction(prefs, pantryNames);

    const { message, recipe_query, suggestions, exclude_allergens, require_diet, pantry_only } =
      await generateChat(turns, system);

    // La receta no la inventa el chat: se resuelve por el pipeline real (caché/web/IA),
    // aplicando también las restricciones que el usuario pide en la conversación.
    let recipe: Record<string, unknown> | null = null;
    const query = typeof recipe_query === 'string' ? recipe_query.trim() : '';
    if (query) {
      try {
        const resolved = await resolveRecipe(
          supabase,
          query.slice(0, MAX_QUERY_LENGTH),
          userId,
          prefs,
          {
            excludeAllergens: sanitizeKeys(exclude_allergens ?? undefined, ALLERGEN_KEYS),
            requireDiet: sanitizeKeys(require_diet ?? undefined, DIET_KEYS),
            pantryOnly: pantry_only === true,
            pantry: pantry_only === true ? pantryNames : undefined,
          },
          { skipCache: true },
        );
        if (resolved.origin === 'rate_limited') {
          return json({ message: RATE_LIMIT_MESSAGE, recipe: null });
        }
        recipe = resolved.recipe;
      } catch (e) {
        // El mensaje conversacional es válido aunque falle la resolución de la receta:
        // lo devolvemos con un aviso en vez de perder toda la respuesta con un 500.
        console.error('chat resolveRecipe:', e);
        return json({ message: `${message}\n\n${RECIPE_ERROR_NOTE}`, recipe: null });
      }
    }

    // Opciones para elegir: solo cuando no se ha pedido una receta concreta.
    const options = !query && Array.isArray(suggestions)
      ? suggestions
          .filter((s) => s && typeof s.title === 'string' && s.title.trim())
          .slice(0, 4)
          .map((s) => ({
            title: s.title.trim().slice(0, 120),
            hint: typeof s.hint === 'string' ? s.hint.trim().slice(0, 80) : '',
          }))
      : [];

    return json({ message, recipe, suggestions: options });
  } catch (e) {
    console.error('chat:', e);
    return json({ error: 'No se pudo responder.' }, 500);
  }
});
