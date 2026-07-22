// Clasifica con Gemini los ingredientes 'Otros' que son su propio canónico (canonical_id null)
// en una categoría controlada, para revisar antes de aplicar. No forma parte del runtime.
//
// Uso:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   GEMINI_API_KEY=<key> \
//   node scripts/reclassify-otros/build-categories.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!url || !serviceKey || !geminiKey) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y/o GEMINI_API_KEY.');
  process.exit(1);
}

const CATALOG_CATEGORIES = [
  'Aceites, vinagres y salsas',
  'Carnes',
  'Cereales, pan y pasta',
  'Condimentos y edulcorantes',
  'Conservas y otros',
  'Especias y hierbas',
  'Frutas',
  'Frutos secos y semillas',
  'Lácteos y huevos',
  'Legumbres',
  'Pescados y mariscos',
  'Verduras y hortalizas',
];

const here = dirname(fileURLToPath(import.meta.url));
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};
const GEN_MODEL = 'gemini-flash-lite-latest';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, category: { type: 'STRING' } },
        required: ['id', 'category'],
      },
    },
  },
  required: ['items'],
};

async function geminiWithRetry(prompt) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
      },
    );
    if (res.status === 429) {
      const body = await res.text();
      const secs = Number(body.match(/retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/)?.[1]) || 20;
      console.warn(`  429 (límite free-tier), esperando ${Math.ceil(secs)}s...`);
      await sleep(Math.ceil(secs) * 1000 + 500);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error('Gemini sigue en 429 tras varios reintentos');
}

const listRes = await fetch(
  `${rest}/ingredients?select=id,name&category=eq.Otros&canonical_id=is.null&order=name`,
  { headers },
);
if (!listRes.ok) {
  console.error(`No se pudieron leer ingredientes: ${listRes.status} ${await listRes.text()}`);
  process.exit(1);
}
const ingredients = await listRes.json();
console.log(`'Otros' canónicos a clasificar: ${ingredients.length}`);

const prompt =
  `Clasifica cada ingrediente de cocina en UNA categoría de esta lista cerrada, y NUNCA "Otros":\n` +
  `${CATALOG_CATEGORIES.join(', ')}.\n\n` +
  `Ingredientes (id | nombre):\n${ingredients.map((i) => `- ${i.id} | ${i.name}`).join('\n')}`;

const data = await geminiWithRetry(prompt);
const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"items":[]}';
const items = JSON.parse(text).items ?? [];

const byId = new Map(ingredients.map((i) => [i.id, i.name]));
const mapping = items
  .filter((it) => byId.has(it.id))
  .map((it) => ({ id: it.id, name: byId.get(it.id), category: String(it.category).trim() }));

await writeFile(join(here, 'categories.json'), JSON.stringify(mapping, null, 2));
console.log(`Escrito categories.json con ${mapping.length}/${ingredients.length} entradas.`);
