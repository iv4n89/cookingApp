// Aplica scripts/reclassify-otros/categories.json y luego propaga en cascada: cada ingrediente
// 'Otros' que es variante toma la categoría de su canónico (ya controlada tras aplicar el JSON).
// Resultado: 0 filas en categoría 'Otros'. Idempotente.
//
// Uso:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/reclassify-otros/apply-categories.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const CATALOG_CATEGORIES = new Set([
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
]);

const here = dirname(fileURLToPath(import.meta.url));
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function setCategory(ids, category) {
  if (ids.length === 0) return;
  const res = await fetch(`${rest}/ingredients?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ category }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
}

// a) Aplicar el JSON revisado (categorías de los 'Otros' canónicos).
const mapping = JSON.parse(await readFile(join(here, 'categories.json'), 'utf8'));
const byCategory = new Map();
let skipped = 0;
for (const m of mapping) {
  if (!CATALOG_CATEGORIES.has(m.category)) {
    skipped++;
    console.warn(`  categoría inválida, se omite: ${m.name} -> ${m.category}`);
    continue;
  }
  if (!byCategory.has(m.category)) byCategory.set(m.category, []);
  byCategory.get(m.category).push(m.id);
}
for (const [category, ids] of byCategory) await setCategory(ids, category);
console.log(`Paso a) canónicos reclasificados: ${mapping.length - skipped} (omitidos: ${skipped}).`);

// b) Cascada: cada 'Otros' variante toma la categoría de su canónico (releído tras a).
const allRes = await fetch(`${rest}/ingredients?select=id,category,canonical_id`, { headers });
if (!allRes.ok) throw new Error(`No se pudo releer ingredients: ${allRes.status}`);
const all = await allRes.json();
const idToCategory = new Map(all.map((r) => [r.id, r.category]));

const inherit = new Map(); // categoría -> ids
for (const r of all) {
  if (r.category !== 'Otros' || !r.canonical_id) continue;
  const cat = idToCategory.get(r.canonical_id);
  if (cat && CATALOG_CATEGORIES.has(cat)) {
    if (!inherit.has(cat)) inherit.set(cat, []);
    inherit.get(cat).push(r.id);
  }
}
let inherited = 0;
for (const [category, ids] of inherit) {
  await setCategory(ids, category);
  inherited += ids.length;
}
console.log(`Paso b) variantes que heredaron: ${inherited}.`);

// Verificación final.
const leftRes = await fetch(`${rest}/ingredients?select=id&category=eq.Otros`, { headers });
const left = leftRes.ok ? (await leftRes.json()).length : -1;
console.log(`Quedan en 'Otros': ${left} (objetivo 0).`);
