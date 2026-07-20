const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = 'gemini-embedding-001';
// Alias "-latest": apunta siempre al flash-lite vigente (evita deprecaciones).
const GEN_MODEL = 'gemini-flash-lite-latest';

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
  const res = await fetch(`${BASE}/models/${EMBED_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify({
      taskType,
      content: { parts: [{ text }] },
      output_dimensionality: EMBED_DIM,
    }),
  });
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
    'ingredients',
    'steps',
  ],
};

export async function generateRecipe(query: string): Promise<GeneratedRecipe> {
  const prompt =
    `Eres un chef profesional. Crea una receta realista y en español para esta petición: "${query}".` +
    ` Usa cantidades concretas, pasos claros y numerados, tiempos y calorías aproximadas, y etiquetas útiles` +
    ` (dieta, dificultad). Añade timer_seconds solo en los pasos que requieran un tiempo de espera o cocción.`;

  const res = await fetch(`${BASE}/models/${GEN_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RECIPE_SCHEMA,
      },
    }),
  });
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
