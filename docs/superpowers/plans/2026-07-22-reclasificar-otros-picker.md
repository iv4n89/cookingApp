# Reclasificar 'Otros' (limpiar el picker) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclasificar las 111 entradas de categoría 'Otros' a categorías controladas (32 con IA, 79 heredando de su canónico en cascada) para que el picker quede ordenado y no haya grupo 'Otros'.

**Architecture:** Dos scripts Node one-off (mismo patrón que el mapeo canónico). `build-categories.mjs` clasifica con Gemini los 32 'Otros' que son su propio canónico → `categories.json` revisable. `apply-categories.mjs` aplica ese JSON y luego setea cada 'Otros' variante = categoría de su canónico. Solo datos: ni migración de esquema ni cambios de cliente.

**Tech Stack:** Node.js (ESM), Supabase PostgREST (service role), Gemini (`gemini-flash-lite-latest`).

**Rama:** `chore/reclasificar-otros` (desde `main`).

**Sin infra de tests:** verificación con `node --check` y consultas psql (recuento de 'Otros' → 0).

**Datos de referencia (Supabase local):**
- REST: `http://127.0.0.1:54321`; psql: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- `SUPABASE_SERVICE_ROLE_KEY`: de `supabase status`.
- `GEMINI_API_KEY`: en `supabase/functions/.env`.
- Reparto: 32 'Otros' canónicos (`canonical_id is null`) + 79 variantes.

---

## File Structure

**Crear:**
- `scripts/reclassify-otros/build-categories.mjs` — clasifica los 32 con Gemini → `categories.json`.
- `scripts/reclassify-otros/categories.json` — mapeo generado (revisado, versionado).
- `scripts/reclassify-otros/apply-categories.mjs` — aplica el JSON + cascada de herencia.

---

## Task 1: Script que clasifica los 32 'Otros' canónicos

**Files:**
- Create: `scripts/reclassify-otros/build-categories.mjs`

- [ ] **Step 1: Escribir el script**

```js
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
```

- [ ] **Step 2: Comprobar sintaxis**

Run: `node --check scripts/reclassify-otros/build-categories.mjs`
Expected: sin errores.

- [ ] **Step 3: Commit del script (aún no del JSON)**

```bash
git add scripts/reclassify-otros/build-categories.mjs
git commit -m "chore(scripts): clasificar 'Otros' canónicos a categoría controlada con IA"
```

---

## Task 2: Generar y revisar `categories.json`

**Files:**
- Create: `scripts/reclassify-otros/categories.json` (generado en este task)

> **Nota (paso humano):** el usuario revisa el JSON generado. El agente NO inventa el contenido.

- [ ] **Step 1: Ejecutar el generador**

Run:
```bash
set -a; source <(grep '^GEMINI_API_KEY=' supabase/functions/.env); set +a
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
node scripts/reclassify-otros/build-categories.mjs
```
Expected: `Escrito categories.json con N/32 entradas.` (N ≈ 32). Si `supabase status --output json` no está, obtén la service_role key con `supabase status` y pásala a mano.

- [ ] **Step 2: Revisión rápida**

Run: `node -e "const m=require('./scripts/reclassify-otros/categories.json'); console.log(m.length,'entradas'); const bad=m.filter(x=>!['Aceites, vinagres y salsas','Carnes','Cereales, pan y pasta','Condimentos y edulcorantes','Conservas y otros','Especias y hierbas','Frutas','Frutos secos y semillas','Lácteos y huevos','Legumbres','Pescados y mariscos','Verduras y hortalizas'].includes(x.category)); console.log('categorías inválidas:', bad.length, bad); m.forEach(x=>console.log(x.name,'->',x.category))"`
Expected: lista `nombre -> categoría`; `categorías inválidas: 0`. El usuario corrige a mano en `categories.json` lo que no encaje.

- [ ] **Step 3: Commit del JSON revisado**

```bash
git add scripts/reclassify-otros/categories.json
git commit -m "chore(data): categorías revisadas de los 'Otros' canónicos"
```

---

## Task 3: Script que aplica la reclasificación (cascada)

**Files:**
- Create: `scripts/reclassify-otros/apply-categories.mjs`

- [ ] **Step 1: Escribir el script**

```js
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
```

- [ ] **Step 2: Comprobar sintaxis**

Run: `node --check scripts/reclassify-otros/apply-categories.mjs`
Expected: sin errores.

- [ ] **Step 3: Ejecutar la aplicación**

Run:
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
node scripts/reclassify-otros/apply-categories.mjs
```
Expected: `Paso a) ...`, `Paso b) ...`, y `Quedan en 'Otros': 0`.

- [ ] **Step 4: Verificar en la base**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) as otros from ingredients where category='Otros';"`
Expected: `0`.

Comprobación puntual: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select name, category from ingredients where normalized_name ~ 'cebolla|leche de coco' order by name;"`
Expected: "Cebolla" en `Verduras y hortalizas`, "Leche de coco" en una categoría controlada.

- [ ] **Step 5: Commit**

```bash
git add scripts/reclassify-otros/apply-categories.mjs
git commit -m "chore(scripts): aplicar reclasificación de 'Otros' (cascada por canónico)"
```

---

## Notas de verificación (resumen)

- **Sintaxis:** `node --check` en ambos scripts.
- **Datos:** tras ejecutar, `count(*) where category='Otros'` = 0; categorías coherentes.
- **Picker:** en el dev-client, el acordeón ya no muestra el grupo 'Otros'.
- **Fuera de alcance:** no se toca `ingredient-picker.tsx`, `listIngredients`, ni el esquema.
