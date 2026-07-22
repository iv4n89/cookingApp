# Caché de alias del resolver del pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cachear las resoluciones nombre→ingrediente en una tabla persistente (`ingredient_aliases`) para que `withIngredientIds` no vuelva a llamar a Gemini con un nombre ya resuelto.

**Architecture:** Nueva tabla `ingredient_aliases (normalized_alias pk → ingredient_id)`. `withIngredientIds` intercala, entre el match exacto y la llamada IA, un lookup de la caché; si todo resuelve por exacto+caché no llama a la IA; tras la IA escribe los pares nuevos en la caché. Degrada al comportamiento actual si la caché falla.

**Tech Stack:** Supabase Postgres, Edge Functions (Deno/TS), Gemini.

**Rama:** `feat/pipeline-alias-cache` (desde `main`).

**Sin infra de tests:** verificación con `supabase migration up`, `deno check` y una prueba e2e (`saveRecipe`).

**Datos de referencia (Supabase local):** psql `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; REST `http://127.0.0.1:54321`; service role de `supabase status`; `GEMINI_API_KEY` en `supabase/functions/.env`. Última migración en `main`: `0029`.

---

## File Structure

**Crear:**
- `supabase/migrations/0030_ingredient_aliases.sql` — tabla + RLS + grants.

**Modificar:**
- `supabase/functions/_shared/recipes.ts` — reescribir `withIngredientIds` con la caché.

---

## Task 1: Tabla `ingredient_aliases`

**Files:**
- Create: `supabase/migrations/0030_ingredient_aliases.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Caché de resolución nombre->ingrediente del pipeline: el resolver IA (withIngredientIds) guarda
-- aquí cada nombre generado por el LLM ya resuelto, para no volver a llamar a Gemini con él.
-- Es catálogo (no datos de usuario). El ingredient_id puede ser canónico o variante; el match
-- por canónico de la RPC/cliente hace el resto.
create table ingredient_aliases (
  normalized_alias text primary key,
  ingredient_id uuid not null references ingredients (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ingredient_aliases_ingredient_idx on ingredient_aliases (ingredient_id);

alter table ingredient_aliases enable row level security;
create policy "ingredient_aliases_select_authenticated" on ingredient_aliases
  for select to authenticated using (true);
grant select on ingredient_aliases to authenticated;
grant select, insert, update, delete on ingredient_aliases to service_role;
```

- [ ] **Step 2: Aplicar a la Supabase local**

Run: `supabase migration up`
Expected: aplica `0030_ingredient_aliases` sin error.

- [ ] **Step 3: Verificar la tabla**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d ingredient_aliases"`
Expected: columnas `normalized_alias text` (PK), `ingredient_id uuid` (FK a ingredients, on delete cascade), `created_at`; RLS habilitada.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0030_ingredient_aliases.sql
git commit -m "feat(db): tabla ingredient_aliases (caché de resolución del pipeline)"
```

---

## Task 2: `withIngredientIds` usa la caché

**Files:**
- Modify: `supabase/functions/_shared/recipes.ts`

- [ ] **Step 1: Reemplazar la función `withIngredientIds`**

Sustituye la función completa `withIngredientIds` (desde su comentario `// Enlaza cada ingrediente
de la receta al catálogo por su canónico.` hasta su `}` de cierre) por:

```ts
// Enlaza cada ingrediente de la receta al catálogo por su canónico. Orden de resolución:
// (1) match exacto por normalized_name; (2) caché de alias (ingredient_aliases) de nombres ya
// resueltos antes; (3) solo lo que quede va al resolver IA, que mapea a un canonical_name del
// catálogo y crea los nuevos bien categorizados. Tras la IA se cachean los pares nuevos. Nunca
// se crean entradas en 'Otros'. Ante fallo de IA: exacto + caché y el resto sin enlazar; la
// receta se guarda igual.
async function withIngredientIds(
  supabase: SupabaseClient,
  ingredients: { name: string }[],
): Promise<Record<string, unknown>[]> {
  if (ingredients.length === 0) return [];

  const norms = [...new Set(ingredients.map((i) => normalizeName(i.name)).filter(Boolean))];

  // (1) Índice del catálogo COMPLETO por normalized_name.
  const { data: exact } = await supabase
    .from('ingredients')
    .select('id, normalized_name')
    .in('normalized_name', norms);
  const exactByNorm = new Map<string, string>((exact ?? []).map((r) => [r.normalized_name, r.id]));

  // (2) Caché de alias: nombres del LLM ya resueltos antes, para no volver a llamar a la IA.
  const unresolvedNorms = norms.filter((n) => !exactByNorm.has(n));
  const aliasByNorm = new Map<string, string>();
  if (unresolvedNorms.length > 0) {
    const { data: aliases } = await supabase
      .from('ingredient_aliases')
      .select('normalized_alias, ingredient_id')
      .in('normalized_alias', unresolvedNorms);
    for (const a of aliases ?? []) {
      aliasByNorm.set(a.normalized_alias as string, a.ingredient_id as string);
    }
  }

  const resolved = new Map<string, string>(); // normalizeName(input) -> ingredient_id
  const resolveKnown = () => {
    for (const i of ingredients) {
      const n = normalizeName(i.name);
      const id = exactByNorm.get(n) ?? aliasByNorm.get(n);
      if (id) resolved.set(n, id);
    }
  };

  // (3) Fast-path: todo resuelto por exacto o caché -> sin IA.
  if (norms.every((n) => exactByNorm.has(n) || aliasByNorm.has(n))) {
    resolveKnown();
    return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
  }

  // Catálogo canónico como vocabulario del resolver + índice normalized_name -> id de canónicos.
  const { data: canon } = await supabase
    .from('ingredients')
    .select('id, name, category, normalized_name')
    .is('canonical_id', null);
  const canonList = (canon ?? []) as {
    id: string;
    name: string;
    category: string;
    normalized_name: string;
  }[];
  const canonByNorm = new Map<string, string>(canonList.map((c) => [c.normalized_name, c.id]));

  // Solo los nombres que no resuelven por exacto ni caché van a la IA.
  const seenAi = new Set<string>();
  const namesForAi: string[] = [];
  for (const i of ingredients) {
    const n = normalizeName(i.name);
    if (!n || exactByNorm.has(n) || aliasByNorm.has(n) || seenAi.has(n)) continue;
    seenAi.add(n);
    namesForAi.push(i.name);
  }

  let items: ResolvedIngredient[];
  try {
    items = await resolveIngredients(
      namesForAi,
      canonList.map((c) => ({ name: c.name, category: c.category })),
    );
  } catch (e) {
    // Fallback: exacto + caché; el resto sin enlazar. Nunca 'Otros'.
    console.error('resolveIngredients:', e);
    resolveKnown();
    return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
  }

  // input normalizado -> canonical_name normalizado; y set de canónicos nuevos a crear.
  const inputToCanon = new Map<string, string>();
  const toCreate = new Map<string, { name: string; category: string }>();
  for (const it of items) {
    const inputNorm = normalizeName(it.input);
    const canonNorm = normalizeName(it.canonical_name);
    if (!inputNorm || !canonNorm) continue;
    inputToCanon.set(inputNorm, canonNorm);
    if (canonByNorm.has(canonNorm)) continue; // el canónico ya existe
    if (!CATALOG_CATEGORIES.includes(it.category)) continue; // categoría inválida -> no crear
    if (!toCreate.has(canonNorm)) {
      toCreate.set(canonNorm, { name: it.canonical_name.trim(), category: it.category });
    }
  }

  // Crear los nuevos canónicos (canonical_id null), idempotente por normalized_name.
  if (toCreate.size > 0) {
    const rows = [...toCreate.entries()].map(([norm, v]) => ({
      name: v.name,
      normalized_name: norm,
      category: v.category,
      canonical_id: null,
    }));
    await supabase
      .from('ingredients')
      .upsert(rows, { onConflict: 'normalized_name', ignoreDuplicates: true });
    const { data: created } = await supabase
      .from('ingredients')
      .select('id, normalized_name')
      .in('normalized_name', [...toCreate.keys()]);
    for (const r of created ?? []) canonByNorm.set(r.normalized_name, r.id);
  }

  // Resolver cada ingrediente: exacto -> caché -> canónico de la IA.
  for (const i of ingredients) {
    const inputNorm = normalizeName(i.name);
    if (exactByNorm.has(inputNorm)) {
      resolved.set(inputNorm, exactByNorm.get(inputNorm)!);
      continue;
    }
    if (aliasByNorm.has(inputNorm)) {
      resolved.set(inputNorm, aliasByNorm.get(inputNorm)!);
      continue;
    }
    const canonNorm = inputToCanon.get(inputNorm);
    if (canonNorm && canonByNorm.has(canonNorm)) {
      resolved.set(inputNorm, canonByNorm.get(canonNorm)!);
    }
  }

  // Cachear en ingredient_aliases los nombres recién resueltos por IA (no los ya conocidos).
  const newAliases = new Map<string, string>();
  for (const i of ingredients) {
    const inputNorm = normalizeName(i.name);
    if (!inputNorm || exactByNorm.has(inputNorm) || aliasByNorm.has(inputNorm)) continue;
    const id = resolved.get(inputNorm);
    if (id) newAliases.set(inputNorm, id);
  }
  if (newAliases.size > 0) {
    await supabase.from('ingredient_aliases').upsert(
      [...newAliases].map(([normalized_alias, ingredient_id]) => ({ normalized_alias, ingredient_id })),
      { onConflict: 'normalized_alias', ignoreDuplicates: true },
    );
  }

  return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
}
```

- [ ] **Step 2: Verificar tipos (Deno)**

Run: `deno check supabase/functions/_shared/recipes.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/recipes.ts
git commit -m "feat(ai): caché de alias en withIngredientIds (evita IA en nombres ya vistos)"
```

---

## Task 3: Verificación end-to-end

**Files:** ninguno.

- [ ] **Step 1: Type-check del módulo**

Run: `deno check supabase/functions/_shared/recipes.ts supabase/functions/_shared/gemini.ts`
Expected: sin errores.

- [ ] **Step 2: Harness Deno que ejerce `saveRecipe` dos veces con el mismo nombre nuevo**

Crea un fichero temporal en el scratchpad (NO commitear) `verify-alias.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { saveRecipe } from '/home/ibetanzos/dev/recetasApp/supabase/functions/_shared/recipes.ts';

const supabase = createClient(Deno.env.get('SB_URL')!, Deno.env.get('SB_KEY')!);

// Nombre distintivo que NO está en el catálogo (fuerza la IA la 1ª vez).
const NAME = 'raíz de bardana encurtida ' + Deno.args[0];

const recipe = {
  title: 'Prueba alias ' + Deno.args[0],
  description: 'test',
  source: 'generated' as const,
  servings: 2,
  prep_time_min: 5,
  cook_time_min: 5,
  tags: ['prueba'],
  ingredients: [{ name: NAME }, { name: 'cebolla morada' }],
  steps: [{ order: 1, instruction: 'Mezclar.', timerSeconds: null }],
  reusable: false,
};

const saved = await saveRecipe(supabase, recipe as never);
console.log('RECIPE_ID', (saved as { id: string }).id);
```

- [ ] **Step 3: 1ª ejecución — crea el alias (llama a la IA)**

Run:
```bash
set -a; source <(grep '^GEMINI_API_KEY=' supabase/functions/.env); set +a
SB_URL=http://127.0.0.1:54321 \
SB_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
deno run --allow-net --allow-env <scratchpad>/verify-alias.ts run1
```
Expected: imprime `RECIPE_ID ...`. Luego:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select normalized_alias, ingredient_id from ingredient_aliases where normalized_alias like 'raiz de bardana%';"`
Expected: al menos una fila (el alias se escribió). El `normalized_alias` NO coincide con el `normalized_name` de ninguna entrada del catálogo (el canónico se creó como "bardana" o similar).

- [ ] **Step 4: 2ª ejecución con el MISMO nombre — resuelve por caché**

Vuelve a ejecutar el harness con `run1` de nuevo (mismo `NAME`, misma cadena de args) para repetir el nombre exacto:
```bash
set -a; source <(grep '^GEMINI_API_KEY=' supabase/functions/.env); set +a
SB_URL=http://127.0.0.1:54321 \
SB_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
deno run --allow-net --allow-env <scratchpad>/verify-alias.ts run1
```
Comprueba en la última receta que el ingrediente `raíz de bardana encurtida run1` enlaza al MISMO `ingredient_id` que el alias, sin crear un canónico nuevo:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<'SQL'
select ing->>'name' as receta_ing, (ing->>'ingredient_id')::uuid as iid
from recipes rec, jsonb_array_elements(rec.ingredients) ing
where rec.id = (select id from recipes order by created_at desc limit 1)
  and ing->>'name' like 'raíz de bardana%';
SQL
```
Expected: `iid` = el `ingredient_id` del alias del Step 3. Como ese nombre no casa por `normalized_name` con ninguna entrada del catálogo, solo la caché pudo resolverlo sin IA (el fast-path devuelve antes de llamar a `resolveIngredients` cuando el otro ingrediente, "cebolla morada", también resuelve por exacto/canónico).

- [ ] **Step 5: Limpieza**

Borra las recetas de prueba (`reusable=false`, no afectan a recomendaciones, pero para no dejar basura):
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "delete from recipes where title like 'Prueba alias %';"`
El harness del scratchpad no se commitea.

---

## Notas de verificación (resumen)

- **DB:** `\d ingredient_aliases` correcta.
- **Tipos:** `deno check` limpio.
- **E2E:** 1ª guardada escribe el alias; 2ª guardada con el mismo nombre resuelve por caché (mismo `ingredient_id`, sin duplicar catálogo).
- **Fuera de alcance:** no toca cliente/RPC; no siembra la tabla.
