// Genera scripts/canonicalize/mapping.json: agrupa los ingredientes del catálogo por su
// concepto canónico con Gemini, para revisar antes de aplicar. No forma parte del runtime.
//
// Uso:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   GEMINI_API_KEY=<key> \
//   node scripts/canonicalize/build-mapping.mjs

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

const here = dirname(fileURLToPath(import.meta.url));
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};
const GEN_MODEL = 'gemini-flash-lite-latest';
const BATCH = 40;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, canonical_name: { type: 'STRING' } },
        required: ['id', 'canonical_name'],
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

async function classifyBatch(batch, known) {
  const prompt =
    `Agrupa ingredientes de cocina por su CONCEPTO canónico. Para cada ingrediente devuelve un ` +
    `"canonical_name" en minúsculas y singular que represente el ingrediente base, colapsando ` +
    `diferencias de VARIEDAD, color o formato (p.ej. "Cebolla blanca", "Cebolla morada", ` +
    `"cebolla roja picada" -> "cebolla"; "Tomate rama", "Tomate pera", "tomate maduro" -> "tomate"; ` +
    `"Harina" y "Harina de trigo" -> "harina de trigo"). PERO mantén separados los ingredientes ` +
    `sustancialmente distintos ("leche" vs "leche de coco"; "harina de trigo" vs "harina de maíz"). ` +
    `REUTILIZA exactamente uno de estos canónicos ya asignados cuando el concepto coincida: ` +
    `${known.length ? known.join(', ') : '(ninguno todavía)'}.\n\n` +
    `Ingredientes (id | nombre | categoría):\n` +
    `${batch.map((i) => `- ${i.id} | ${i.name} | ${i.category}`).join('\n')}`;
  const data = await geminiWithRetry(prompt);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"items":[]}';
  return JSON.parse(text).items ?? [];
}

const listRes = await fetch(`${rest}/ingredients?select=id,name,category&order=category,name`, {
  headers,
});
if (!listRes.ok) {
  console.error(`No se pudieron leer ingredientes: ${listRes.status} ${await listRes.text()}`);
  process.exit(1);
}
const ingredients = await listRes.json();
console.log(`Ingredientes: ${ingredients.length}`);

const byId = new Map(ingredients.map((i) => [i.id, i]));
const known = new Set();
const mapping = [];
for (let start = 0; start < ingredients.length; start += BATCH) {
  const batch = ingredients.slice(start, start + BATCH);
  await sleep(4500);
  const items = await classifyBatch(batch, [...known]);
  for (const it of items) {
    const ing = byId.get(it.id);
    if (!ing) continue;
    const canonical_name = String(it.canonical_name).toLowerCase().trim();
    known.add(canonical_name);
    mapping.push({ id: ing.id, name: ing.name, category: ing.category, canonical_name });
  }
  console.log(`  ${Math.min(start + BATCH, ingredients.length)}/${ingredients.length}`);
}

await writeFile(join(here, 'mapping.json'), JSON.stringify(mapping, null, 2));
console.log(`Escrito mapping.json: ${mapping.length} entradas, ${known.size} canónicos.`);
