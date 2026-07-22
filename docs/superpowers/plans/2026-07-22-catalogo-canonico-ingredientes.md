# Catálogo canónico de ingredientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la despensa case con las recetas resolviendo los ingredientes a un canónico común (`coalesce(canonical_id, id)`), y usar ese canónico en la RPC `recommended_recipes` para que la Home muestre recetas cocinables.

**Architecture:** Se añade `ingredients.canonical_id` (auto-referencia). Un script con IA genera un mapeo revisable (`mapping.json`) que agrupa los 442 ingredientes por concepto; otro script lo aplica seteando `canonical_id`. La RPC `recommended_recipes` (de la rama de la Home) se reescribe para comparar despensa/staples/receta por canónico en vez de por `ingredient_id` directo. No se re-apuntan ids existentes; no se toca el match por nombre del cliente (cocinar/compra/detalle ya funcionan).

**Tech Stack:** Supabase Postgres (plpgsql), Node.js (scripts ESM one-off), Gemini (`gemini-flash-lite-latest`).

**Rama:** `feat/catalogo-canonico`, apilada sobre `feat/home-recetas-sugeridas` (PR #69). Requiere que exista la RPC de buckets (`0026_recommended_recipes_buckets.sql`).

**Sin infra de tests:** verificación real contra la Supabase local (psql), `node --check`, y el diagnóstico de match antes/después.

---

## File Structure

**Crear:**
- `supabase/migrations/0027_ingredients_canonical.sql` — columna `canonical_id` + índice.
- `scripts/canonicalize/build-mapping.mjs` — genera `mapping.json` con Gemini.
- `scripts/canonicalize/mapping.json` — mapeo generado (revisado por el usuario, versionado).
- `scripts/canonicalize/apply-mapping.mjs` — aplica el mapeo (setea `canonical_id`).
- `supabase/migrations/0028_recommended_recipes_canon.sql` — RPC que compara por canónico.

**Datos de referencia (Supabase local):**
- URL: `http://127.0.0.1:54321` (REST) / `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (psql).
- `SUPABASE_SERVICE_ROLE_KEY`: de `supabase status`.
- `GEMINI_API_KEY`: en `supabase/functions/.env` (línea `GEMINI_API_KEY=...`).
- Usuario de prueba con despensa (23 items): `30383ee5-26d4-4822-a373-4c4ed0144457`.

---

## Task 1: Columna `canonical_id`

**Files:**
- Create: `supabase/migrations/0027_ingredients_canonical.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Canónico de cada ingrediente: variantes/genéricos ("Cebolla", "Cebolla blanca") apuntan a
-- un canónico común. canonical_id null = es su propio canónico. El match despensa<->receta
-- se resuelve por canon(x) = coalesce(canonical_id, id). No se re-apuntan ids existentes.
alter table ingredients add column canonical_id uuid references ingredients (id) on delete set null;
create index ingredients_canonical_id_idx on ingredients (canonical_id);
```

- [ ] **Step 2: Aplicar a la Supabase local**

Run: `supabase migration up`
Expected: aplica `0027_ingredients_canonical` sin error.

- [ ] **Step 3: Verificar la columna**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d ingredients" | grep canonical_id`
Expected: aparece `canonical_id | uuid` y el índice `ingredients_canonical_id_idx`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0027_ingredients_canonical.sql
git commit -m "feat(db): columna canonical_id en ingredients"
```

---

## Task 2: Script que genera el mapeo con IA

**Files:**
- Create: `scripts/canonicalize/build-mapping.mjs`

- [ ] **Step 1: Escribir el script**

```js
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
```

- [ ] **Step 2: Comprobar sintaxis**

Run: `node --check scripts/canonicalize/build-mapping.mjs`
Expected: sin errores.

- [ ] **Step 3: Ejecutar para generar el mapeo**

Run:
```bash
set -a; source <(grep '^GEMINI_API_KEY=' supabase/functions/.env); set +a
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
node scripts/canonicalize/build-mapping.mjs
```
Expected: imprime el progreso por lotes y `Escrito mapping.json: N entradas, M canónicos.` (N ≈ 442). Si el `supabase status --output json` no está disponible, obtén la service_role key con `supabase status` y pásala a mano.

- [ ] **Step 4: Commit del script (aún no del mapping.json)**

```bash
git add scripts/canonicalize/build-mapping.mjs
git commit -m "chore(scripts): generador de mapeo canónico de ingredientes con IA"
```

---

## Task 3: Revisar y versionar `mapping.json`

**Files:**
- Create: `scripts/canonicalize/mapping.json` (ya generado en Task 2)

> **Nota (paso humano):** este paso lo revisa el usuario. El agente NO debe inventar el
> contenido; usa el `mapping.json` generado por el script.

- [ ] **Step 1: Revisión rápida de coherencia**

Run: `node -e "const m=require('./scripts/canonicalize/mapping.json'); const g={}; for(const x of m) (g[x.canonical_name]??=[]).push(x.name); const groups=Object.entries(g).sort((a,b)=>b[1].length-a[1].length); console.log('canónicos:', groups.length, 'ingredientes:', m.length); console.log(groups.slice(0,15).map(([k,v])=>k+' <- '+v.join(', ')).join('\n'))"`
Expected: lista de los canónicos con más miembros (p.ej. `cebolla <- Cebolla, Cebolla blanca, Cebolla morada, ...`). Sirve para detectar agrupaciones raras.

- [ ] **Step 2: El usuario ajusta a mano lo que no encaje**

Editar `scripts/canonicalize/mapping.json` cambiando el `canonical_name` de las entradas mal agrupadas (p.ej. si "leche de coco" quedó bajo "leche", corregirlo). El agrupamiento final lo determina la igualdad exacta de `canonical_name`.

- [ ] **Step 3: Commit del mapeo revisado**

```bash
git add scripts/canonicalize/mapping.json
git commit -m "chore(data): mapeo canónico de ingredientes revisado"
```

---

## Task 4: Script que aplica el mapeo

**Files:**
- Create: `scripts/canonicalize/apply-mapping.mjs`

- [ ] **Step 1: Escribir el script**

```js
// Aplica scripts/canonicalize/mapping.json a la base: agrupa por canonical_name, elige un
// canónico por grupo (prefiere categoría != 'Otros', luego nombre más corto) y setea
// ingredients.canonical_id (canónico -> null, resto -> id del canónico). Idempotente.
//
// Uso:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/canonicalize/apply-mapping.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function patch(ids, canonicalId) {
  const res = await fetch(`${rest}/ingredients?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ canonical_id: canonicalId }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
}

const mapping = JSON.parse(await readFile(join(here, 'mapping.json'), 'utf8'));
const groups = new Map();
for (const m of mapping) {
  if (!groups.has(m.canonical_name)) groups.set(m.canonical_name, []);
  groups.get(m.canonical_name).push(m);
}

let canonCount = 0;
let variantCount = 0;
for (const [, members] of groups) {
  // Canónico: preferir categoría != 'Otros', luego nombre más corto, luego id estable.
  const sorted = [...members].sort(
    (a, b) =>
      (a.category === 'Otros') - (b.category === 'Otros') ||
      a.name.length - b.name.length ||
      a.id.localeCompare(b.id),
  );
  const canonical = sorted[0];
  await patch([canonical.id], null);
  canonCount++;
  const variants = sorted.slice(1).map((m) => m.id);
  if (variants.length) {
    await patch(variants, canonical.id);
    variantCount += variants.length;
  }
}
console.log(`Aplicado: ${groups.size} grupos, ${canonCount} canónicos, ${variantCount} variantes.`);
```

- [ ] **Step 2: Comprobar sintaxis**

Run: `node --check scripts/canonicalize/apply-mapping.mjs`
Expected: sin errores.

- [ ] **Step 3: Ejecutar la aplicación**

Run:
```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
node scripts/canonicalize/apply-mapping.mjs
```
Expected: `Aplicado: G grupos, C canónicos, V variantes.` con `C + V ≈ 442`.

- [ ] **Step 4: Verificar en la base**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) filter (where canonical_id is null) as canonicos, count(*) filter (where canonical_id is not null) as variantes, count(*) total from ingredients;"`
Expected: `canonicos + variantes = total` (442). `variantes > 0` (varias entradas 'Otros' ahora apuntan a un canónico controlado).

Comprobación puntual: `psql ... -c "select i.name, c.name as canonico from ingredients i left join ingredients c on c.id=i.canonical_id where i.normalized_name ~ 'cebolla|tomate' order by i.name;"`
Expected: "Cebolla" (Otros) y "Cebolla blanca"/"Cebolla morada" comparten canónico.

- [ ] **Step 5: Commit**

```bash
git add scripts/canonicalize/apply-mapping.mjs
git commit -m "chore(scripts): aplicar mapeo canónico a ingredients.canonical_id"
```

---

## Task 5: `recommended_recipes` por canónico

**Files:**
- Create: `supabase/migrations/0028_recommended_recipes_canon.sql`

- [ ] **Step 1: Escribir la migración**

Reescribe la función de `0026_recommended_recipes_buckets.sql` cambiando SOLO las CTE
`pantry`, `staple` y `scored` para resolver por canónico (`coalesce(canonical_id, id)`). El
resto (preferencias, buckets, dedup, pasada `idea`) es idéntico.

```sql
-- Sugeridas de la Home comparando por CANÓNICO (coalesce(canonical_id, id)) en vez de por
-- ingredient_id directo, para que "Cebolla blanca" de la despensa case con "cebolla" de la
-- receta. Reescribe 0026 cambiando solo las CTE pantry/staple/scored.
drop function if exists recommended_recipes(int, int, text, uuid[]);
create function recommended_recipes(
  p_limit int default 6,
  p_extra_limit int default 3,
  p_meal_type text default null,
  p_exclude uuid[] default '{}'
)
returns table (
  id uuid,
  title text,
  description text,
  image_url text,
  prep_time_min int,
  cook_time_min int,
  tags text[],
  match_count int,
  missing_count int,
  bucket text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_exclude_allergens text[];
  v_require_diet text[];
  v_picked uuid[] := '{}';
  picked vector(768)[] := array[]::vector(768)[];
  e vector(768);
  n_main int := 0;
  n_buy int := 0;
  b text;
  too_similar boolean;
  r record;
begin
  -- Preferencias -> claves de alérgeno (mapa espejo de _shared/preferences.ts).
  select coalesce(array_agg(distinct m.allergen), '{}')
    into v_exclude_allergens
  from user_preferences up
  cross join lateral unnest(up.special_needs) as sn
  join (values
    ('Frutos secos','nuts'), ('Cacahuete','peanut'),
    ('Marisco','crustaceans'), ('Marisco','molluscs'),
    ('Pescado','fish'), ('Huevo','egg'), ('Leche','milk'), ('Soja','soy'),
    ('Sésamo','sesame'), ('Mostaza','mustard'), ('Apio','celery'), ('Lactosa','milk'),
    ('Gluten / celiaquía','gluten'), ('Fructosa','fructose'), ('Histamina','histamine'),
    ('Sorbitol','sorbitol'), ('Sin cerdo','pork'), ('Sin alcohol','alcohol'),
    ('Halal','pork'), ('Halal','alcohol'),
    ('Kosher','pork'), ('Kosher','crustaceans'), ('Kosher','molluscs')
  ) as m(need, allergen) on m.need = sn
  where up.user_id = v_uid;

  -- Preferencias -> dieta requerida (mapa espejo de _shared/preferences.ts).
  select coalesce(array_agg(distinct d.diet), '{}')
    into v_require_diet
  from user_preferences up
  cross join lateral unnest(up.food_prefs) as fp
  join (values
    ('Vegana','vegan'), ('Vegana','vegetarian'), ('Vegetariana','vegetarian')
  ) as d(pref, diet) on d.pref = fp
  where up.user_id = v_uid;

  v_exclude_allergens := coalesce(v_exclude_allergens, '{}');
  v_require_diet := coalesce(v_require_diet, '{}');

  -- Pantry + buy en una sola pasada. Comparación por canónico.
  for r in
    with pantry as (
      select distinct coalesce(i.canonical_id, i.id) as cid
      from pantry_items p
      join ingredients i on i.id = p.ingredient_id
      where p.user_id = v_uid and p.ingredient_id is not null
    ),
    staple as (
      select distinct coalesce(i.canonical_id, i.id) as cid
      from ingredients i
      where i.category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
    ),
    scored as (
      select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match,
             count(distinct x.iid) filter (where pantry.cid is not null)::int as mc,
             count(distinct x.iid) filter (where pantry.cid is null and staple.cid is null)::int as missing
      from recipes rec
      join lateral jsonb_array_elements(rec.ingredients) ing on true
      cross join lateral (select (ing->>'ingredient_id')::uuid as raw_iid) x0
      left join ingredients ri on ri.id = x0.raw_iid
      cross join lateral (select coalesce(ri.canonical_id, ri.id) as iid) x
      left join pantry on pantry.cid = x.iid
      left join staple on staple.cid = x.iid
      where x0.raw_iid is not null
        and rec.reusable
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
      group by rec.id
    )
    select * from scored
    where mc >= 1 and missing <= 4
    order by (missing <= 1) desc, slot_match desc, missing asc, mc desc, created_at desc
  loop
    exit when n_main >= p_limit and n_buy >= p_extra_limit;
    b := case when r.missing <= 1 then 'pantry' else 'buy' end;
    if b = 'pantry' and n_main >= p_limit then continue; end if;
    if b = 'buy' and n_buy >= p_extra_limit then continue; end if;

    too_similar := false;
    if r.embedding is not null then
      foreach e in array picked loop
        if 1 - (r.embedding <=> e) > 0.9 then too_similar := true; exit; end if;
      end loop;
    end if;
    if too_similar then continue; end if;
    if r.embedding is not null then picked := picked || r.embedding; end if;

    id := r.id; title := r.title; description := r.description; image_url := r.image_url;
    prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
    match_count := r.mc; missing_count := r.missing; bucket := b;
    v_picked := v_picked || r.id;
    if b = 'pantry' then n_main := n_main + 1; else n_buy := n_buy + 1; end if;
    return next;
  end loop;

  -- Idea: solo si la despensa no dio nada para la sección principal.
  if n_main = 0 then
    for r in
      select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match
      from recipes rec
      where rec.reusable
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
        and rec.id <> all(v_picked)
      order by slot_match desc, rec.created_at desc
    loop
      exit when n_main >= p_limit;
      too_similar := false;
      if r.embedding is not null then
        foreach e in array picked loop
          if 1 - (r.embedding <=> e) > 0.9 then too_similar := true; exit; end if;
        end loop;
      end if;
      if too_similar then continue; end if;
      if r.embedding is not null then picked := picked || r.embedding; end if;
      id := r.id; title := r.title; description := r.description; image_url := r.image_url;
      prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
      match_count := 0; missing_count := 0; bucket := 'idea';
      n_main := n_main + 1;
      return next;
    end loop;
  end if;
end;
$$;

grant execute on function recommended_recipes(int, int, text, uuid[]) to authenticated;
```

- [ ] **Step 2: Aplicar a la Supabase local**

Run: `supabase migration up`
Expected: aplica `0028_recommended_recipes_canon` sin error.

- [ ] **Step 3: Verificar que el match sube (antes/después)**

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"30383ee5-26d4-4822-a373-4c4ed0144457"}';
select bucket, count(*), min(missing_count) mn, max(missing_count) mx
from recommended_recipes(6, 3, null, '{}') group by bucket order by bucket;
rollback;
SQL
```
Expected: comparado con antes (bucket `pantry` tenía 1 receta con missing 1), ahora hay MÁS recetas en `pantry` (missing ≤ 1) y/o `match_count` mayor, porque "Cebolla blanca"/"Tomate rama"/etc. ya cuentan como match. Debe seguir sin error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0028_recommended_recipes_canon.sql
git commit -m "feat(db): recommended_recipes compara por canónico"
```

---

## Self-review checklist (para el ejecutor)

- Task 4 Step 3 puede requerir la service_role key a mano si `supabase status --output json`
  no está disponible en el entorno; obtenla de `supabase status`.
- `mapping.json` es un artefacto revisado por humano: no regenerarlo tras la revisión salvo
  que se decida rehacer el mapeo.
- No se toca `pantry-match.ts` ni las RPC de cocinar/compra: fuera de alcance.

---

## Notas de verificación (resumen)

- **Esquema:** `\d ingredients` muestra `canonical_id` + índice.
- **Mapeo:** `mapping.json` generado, revisado, y `apply-mapping` deja `canonical_id`
  poblado (canónicos + variantes = 442).
- **RPC:** el diagnóstico del usuario de prueba muestra más recetas cocinables (`missing<=1`)
  que antes.
- **E2E (usuario):** recargar la Home en el dev-client y ver recetas en "Ideas para tu {franja}".
