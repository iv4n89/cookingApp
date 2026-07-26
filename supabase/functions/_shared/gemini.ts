import { fetchWithTimeout } from './http.ts';
import { CATALOG_CATEGORIES } from './preferences.ts';
import { SEASON_KEYS } from './recipe-seasons.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_TIMEOUT_MS = 15000;
const GEN_TIMEOUT_MS = 30000;
// Alias "-latest": apunta siempre al flash-lite vigente (evita deprecaciones).
const GEN_MODEL = 'gemini-flash-lite-latest';
// El chat usa flash-lite igual que la generación: flash (gemini-3.6-flash) tiene un límite
// free-tier de 20 req/día que rompe el chat. Constante aparte para poder subirlo a flash cuando
// Gemini esté en un tier de pago.
const CHAT_MODEL = 'gemini-flash-lite-latest';

export const EMBED_DIM = 768;

export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

function apiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  return key;
}

// gemini-embedding-001 requiere normalizar a mano si output_dimensionality != 3072.
function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, x) => sum + x * x, 0));
  return norm > 0 ? values.map((x) => x / norm) : values;
}

export async function embedText(text: string, taskType: EmbedTask): Promise<number[]> {
  const res = await fetchWithTimeout(
    `${BASE}/models/${EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        taskType,
        content: { parts: [{ text }] },
        output_dimensionality: EMBED_DIM,
      }),
    },
    EMBED_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error('Respuesta de embedding inesperada de Gemini');
  }
  return normalize(values);
}

export interface GeneratedRecipe {
  title: string;
  description: string;
  servings: number;
  prep_time_min: number;
  cook_time_min: number;
  calories?: number;
  tags: string[];
  allergens?: string[];
  diet?: string[];
  meal_types?: string[];
  seasons: string[];
  ingredients: { name: string; quantity?: string; unit?: string }[];
  steps: { instruction: string; timer_seconds?: number }[];
}

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    servings: { type: 'INTEGER' },
    prep_time_min: { type: 'INTEGER' },
    cook_time_min: { type: 'INTEGER' },
    calories: { type: 'INTEGER' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    allergens: { type: 'ARRAY', items: { type: 'STRING' } },
    diet: { type: 'ARRAY', items: { type: 'STRING' } },
    meal_types: { type: 'ARRAY', items: { type: 'STRING' } },
    seasons: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...SEASON_KEYS] },
    },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'STRING' },
          unit: { type: 'STRING' },
        },
        required: ['name'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          instruction: { type: 'STRING' },
          timer_seconds: { type: 'INTEGER' },
        },
        required: ['instruction'],
      },
    },
  },
  required: [
    'title',
    'description',
    'servings',
    'prep_time_min',
    'cook_time_min',
    'tags',
    'allergens',
    'diet',
    'meal_types',
    'seasons',
    'ingredients',
    'steps',
  ],
};

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface ChatSuggestion {
  title: string;
  hint: string;
}

export interface ChatResponse {
  message: string;
  // Frase de búsqueda cuando el usuario pide/adapta una receta; el sistema la resuelve
  // por el pipeline real (no la inventa el chat). Vacío si el mensaje no pide receta.
  recipe_query?: string | null;
  // Ideas de platos cuando el usuario pide opciones (p.ej. "qué puedo cocinar"): título + pista.
  suggestions?: ChatSuggestion[] | null;
  // Ingredientes que el usuario nombra expresamente y quiere en el plato. El sistema descarta
  // las recetas del catálogo que no los lleven, en vez de servir la mejor para su despensa.
  required_ingredients?: string[] | null;
  // Restricciones que el usuario pide en la conversación (además de sus preferencias
  // guardadas): alérgenos a evitar y dieta requerida. El sistema filtra la caché con ellas.
  exclude_allergens?: string[] | null;
  require_diet?: string[] | null;
  // true cuando el usuario pide cocinar SOLO con lo que tiene en casa / sin comprar. El sistema
  // pasa entonces la despensa como restricción dura a la generación.
  pantry_only?: boolean | null;
  // true cuando el usuario pide ADAPTAR o CAMBIAR una receta (quitar/añadir/sustituir un
  // ingrediente, cambiar raciones, picante, "hazla vegana"…): el sistema genera fresco en vez de
  // buscar en el catálogo. false/omitido cuando pide un plato "de catálogo" sin modificar.
  is_modification?: boolean | null;
}

const CHAT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    message: { type: 'STRING' },
    recipe_query: { type: 'STRING', nullable: true },
    suggestions: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          hint: { type: 'STRING' },
        },
        required: ['title', 'hint'],
      },
    },
    required_ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
    exclude_allergens: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    require_diet: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    pantry_only: { type: 'BOOLEAN' },
    is_modification: { type: 'BOOLEAN', nullable: true },
  },
  // pantry_only y required_ingredients obligatorios: el modelo debe pronunciarse siempre. Si
  // required_ingredients pudiera omitirse, olvidarlo devolvería el chat a recomendar por despensa
  // ignorando lo que se ha pedido.
  required: ['message', 'pantry_only', 'required_ingredients'],
};

// Conversación multi-turno con contexto de sistema (preferencias, despensa…) y salida
// estructurada: texto + receta opcional para pintar la card.
export async function generateChat(
  turns: ChatTurn[],
  systemInstruction: string,
): Promise<ChatResponse> {
  const res = await fetchWithTimeout(
    `${BASE}/models/${CHAT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: CHAT_SCHEMA,
        },
      }),
    },
    GEN_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Gemini chat ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Respuesta de chat inesperada de Gemini');
  }
  return JSON.parse(text) as ChatResponse;
}

export async function generateRecipe(
  query: string,
  preferences?: string,
): Promise<GeneratedRecipe> {
  const prefs = preferences ? `\n\n${preferences}\n` : '';
  const prompt =
    `Eres un chef profesional. Crea una receta realista y en español para esta petición: "${query}".` +
    prefs +
    ` Usa cantidades concretas, pasos claros y numerados, tiempos y calorías aproximadas, y etiquetas útiles` +
    ` (dieta, dificultad). Añade timer_seconds solo en los pasos que requieran un tiempo de espera o cocción.` +
    ` Clasifica la receta con precisión: en "allergens" incluye SOLO las claves de esta lista que la receta` +
    ` contenga realmente: gluten, crustaceans, molluscs, egg, fish, peanut, soy, milk, nuts, celery, mustard,` +
    ` sesame, fructose (fruta, miel, sirope de fructosa), histamine (alimentos fermentados, curados o muy` +
    ` madurados), sorbitol (algunas frutas de hueso y edulcorantes "sin azúcar"), pork, alcohol (deja la lista` +
    ` vacía si no contiene ninguno). En "diet" incluye "vegetarian" si es vegetariana y "vegan" si es vegana` +
    ` (una receta vegana es también vegetariana: incluye ambas).` +
    ` En "meal_types" indica en qué momentos del día encaja el plato, usando SOLO estas claves` +
    ` (una receta puede valer para varias): desayuno, almuerzo, merienda, cena.` +
    ` En "seasons" clasifica la afinidad culinaria del plato para el clima y hábitos de España,` +
    ` no la temporada de sus ingredientes. Usa SOLO spring, summer, autumn, winter o all_year.` +
    ` Usa all_year únicamente si no tiene una afinidad estacional clara y nunca la mezcles con otras claves.`;

  const res = await fetchWithTimeout(
    `${BASE}/models/${GEN_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RECIPE_SCHEMA,
        },
      }),
    },
    GEN_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Gemini generate ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Respuesta de generación inesperada de Gemini');
  }
  return JSON.parse(text) as GeneratedRecipe;
}

export interface ResolvedIngredient {
  input: string; // nombre tal cual lo generó la receta
  canonical_name: string; // concepto base, reutilizando el vocabulario del catálogo
  category: string; // una de CATALOG_CATEGORIES
}

const VISUAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          number: { type: 'INTEGER' },
          visual: { type: 'STRING' },
        },
        required: ['number', 'visual'],
      },
    },
  },
  required: ['items'],
};

// Describe en inglés el aspecto de cada ingrediente para el generador de imágenes. Los nombres en
// español lo despistan ("pimienta negra" acaba dibujando pimientos, "harina" acaba en fideos), así
// que el LLM traduce y concreta forma, color y recipiente antes de pedir la imagen.
// Devuelve la descripción de cada ingrediente en la misma posición que la entrada, o undefined si
// el LLM se saltó ese número.
export async function describeIngredientsVisually(
  items: { name: string; category: string }[],
): Promise<(string | undefined)[]> {
  const prompt =
    `Eres director de fotografía de producto para un catálogo de cocina.\n` +
    `Para cada ingrediente devuelve "visual": cómo se ve tal y como se vende en un supermercado ` +
    `español, escrito EN INGLÉS y en menos de 15 palabras.\n` +
    `Empieza por el nombre del ingrediente en inglés y añade forma, color y textura reales.\n` +
    `Si es líquido o polvo, indica el recipiente ("in a clear glass bottle", "in a small white bowl").\n` +
    `Si es sólido, muéstralo sin recipiente.\n` +
    `En carnes y pescados usa el término inglés del corte exacto que se vende en España y di si ` +
    `lleva hueso y piel: "muslo de pollo" es un drumstick con hueso, no un "thigh" deshuesado.\n` +
    `Nunca inventes marcas, etiquetas ni texto.\n` +
    `Devuelve "number" con el número del ingrediente en la lista.\n\n` +
    `Ingredientes:\n${items.map((i, index) => `${index + 1}. ${i.name} (${i.category})`).join('\n')}`;

  const res = await fetchWithTimeout(
    `${BASE}/models/${GEN_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: VISUAL_SCHEMA },
      }),
    },
    GEN_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Gemini visual ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Respuesta visual inesperada de Gemini');
  const parsed = (JSON.parse(text).items ?? []) as { number: number; visual: string }[];
  const visuals = new Array<string | undefined>(items.length);
  for (const item of parsed) {
    if (item.number >= 1 && item.number <= items.length) visuals[item.number - 1] = item.visual;
  }
  return visuals;
}

const RESOLVE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          input: { type: 'STRING' },
          canonical_name: { type: 'STRING' },
          category: { type: 'STRING' },
        },
        required: ['input', 'canonical_name', 'category'],
      },
    },
  },
  required: ['items'],
};

// Mapea cada nombre de ingrediente de una receta a un concepto canónico del catálogo (o a uno
// nuevo bien categorizado). El servidor luego resuelve canonical_name -> id por nombre; el LLM
// nunca devuelve UUIDs.
export async function resolveIngredients(
  names: string[],
  canonicals: { name: string; category: string }[],
): Promise<ResolvedIngredient[]> {
  const vocab = canonicals.map((c) => `- ${c.name} (${c.category})`).join('\n');
  const prompt =
    `Eres un normalizador de ingredientes de cocina. Para cada ingrediente de entrada devuelve ` +
    `su "canonical_name" (concepto base, en minúsculas y singular) y su "category".\n` +
    `REUTILIZA exactamente uno de los nombres canónicos del catálogo cuando el concepto coincida, ` +
    `colapsando variedad/color/formato ("cebolla morada picada" -> "cebolla"), pero mantén ` +
    `separados los sustancialmente distintos ("leche" vs "leche de coco").\n` +
    `Si el ingrediente no está en el catálogo, propón un canonical_name nuevo y su category.\n` +
    `"category" SOLO puede ser una de estas, y NUNCA "Otros": ${CATALOG_CATEGORIES.join(', ')}.\n` +
    `Devuelve "input" igual que el nombre de entrada.\n\n` +
    `Catálogo canónico (nombre (categoría)):\n${vocab}\n\n` +
    `Ingredientes de entrada:\n${names.map((n) => `- ${n}`).join('\n')}`;

  const res = await fetchWithTimeout(
    `${BASE}/models/${GEN_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESOLVE_SCHEMA },
      }),
    },
    GEN_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Gemini resolve ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Respuesta de resolución inesperada de Gemini');
  }
  return (JSON.parse(text).items ?? []) as ResolvedIngredient[];
}
