# Recetas sugeridas de la Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las recetas sugeridas de la Home usen la despensa (casi completo), respeten preferencias, cambien por franja horaria, tengan fallback por preferencias y se refresquen con pull-to-refresh.

**Architecture:** El núcleo es una reescritura de la RPC Postgres `recommended_recipes` con parámetros de franja y exclusión, filtrado por preferencias leídas en servidor, y dos pasadas (despensa → fallback). Una nueva columna `recipes.meal_types` clasifica las recetas por franja (IA en el pipeline de generación + backfill del pool). El cliente calcula la franja/saludo desde la hora local, rota lo ya visto y expone pull-to-refresh.

**Tech Stack:** Supabase Postgres (plpgsql + pgvector), Edge Functions (Deno/TS), Expo React Native (TS), Gemini (`gemini-flash-lite-latest`).

**Sin infra de tests:** el repo no tiene framework de tests. La verificación es real: migraciones aplicadas a la Supabase local, `\df`/consultas psql, `deno check`, `tsc --noEmit` y comprobación en el dev-client.

---

## File Structure

**Crear:**
- `supabase/migrations/0024_recipes_meal_types.sql` — columna `meal_types` + índice GIN.
- `supabase/migrations/0025_recommended_recipes_v2.sql` — RPC v2.
- `apps/mobile/src/features/home/meal-time.ts` — utilidades puras: franja actual, saludo, etiqueta.
- `scripts/backfill-meal-types.mjs` — clasifica el pool actual con Gemini (one-off).

**Modificar:**
- `supabase/functions/_shared/preferences.ts` — `MEAL_TYPE_KEYS`.
- `supabase/functions/_shared/gemini.ts` — schema + prompt + tipo con `meal_types`.
- `supabase/functions/_shared/recipes.ts` — mapear/persistir `meal_types`.
- `apps/mobile/src/lib/recipes.ts` — tipo `RecommendedRecipe` + firma de `recommendedRecipes`.
- `apps/mobile/src/features/home/hooks/use-home.ts` — franja, rotación, refresh.
- `apps/mobile/src/app/(tabs)/index.tsx` — saludo/título dinámicos + `RefreshControl`.
- `apps/mobile/src/features/home/components/home-suggestions.tsx` — badge por `missing_count`.

---

## Task 1: Columna `meal_types` en `recipes`

**Files:**
- Create: `supabase/migrations/0024_recipes_meal_types.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Franjas horarias de cada receta para las sugeridas de la Home (desayuno/almuerzo/merienda/cena).
-- Una receta puede valer para varias. Se rellena por IA al generar y por backfill del pool.
alter table recipes add column meal_types text[] not null default '{}';
create index recipes_meal_types_idx on recipes using gin (meal_types);
```

- [ ] **Step 2: Aplicar a la Supabase local**

Run: `supabase migration up`
Expected: aplica `0024_recipes_meal_types` sin error.

- [ ] **Step 3: Verificar la columna**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d recipes" | grep meal_types`
Expected: aparece `meal_types | text[]` con default `'{}'::text[]`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0024_recipes_meal_types.sql
git commit -m "feat(db): columna meal_types en recipes"
```

---

## Task 2: RPC `recommended_recipes` v2

**Files:**
- Create: `supabase/migrations/0025_recommended_recipes_v2.sql`

- [ ] **Step 1: Escribir la migración**

Reemplaza la función. Añade `p_meal_type` y `p_exclude`, filtra por preferencias del usuario (leídas de `user_preferences`, con el mapa espejo de `_shared/preferences.ts`), calcula `missing_count` sin contar staples, y hace dos pasadas (despensa casi-completa → fallback por preferencias).

```sql
-- Sugeridas de la Home. Cambios frente a 0018:
--  * p_meal_type (franja) y p_exclude (ya-vistas, para rotación con pull-to-refresh).
--  * Filtra por preferencias (alérgenos/dieta) de user_preferences. El mapa
--    necesidad->alérgeno y preferencia->dieta REPLICA supabase/functions/_shared/preferences.ts;
--    si cambia allí, actualízalo aquí.
--  * Pasada A "casi completo": recetas a las que faltan <=2 ingredientes NO-staple de la
--    despensa (staples = especias/condimentos/aceites-vinagres-salsas, se asumen en casa).
--  * Pasada B (fallback): si A no llena el cupo, completa por preferencias+franja ignorando
--    la despensa.
--  * Mantiene el dedup por variedad (similitud coseno > 0,9).
drop function if exists recommended_recipes(int);
drop function if exists recommended_recipes(int, text, uuid[]);
create function recommended_recipes(
  p_limit int default 6,
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
  missing_count int
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
  n int := 0;
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

  -- Pasada A: por despensa (casi completo, faltan <=2 no-staple).
  for r in
    with pantry as (
      select ingredient_id from pantry_items
      where user_id = v_uid and ingredient_id is not null
    ),
    staple as (
      select id from ingredients
      where category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
    ),
    scored as (
      select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             count(distinct x.iid) filter (where pantry.ingredient_id is not null)::int as mc,
             count(distinct x.iid) filter (where pantry.ingredient_id is null and staple.id is null)::int as missing
      from recipes rec
      join lateral jsonb_array_elements(rec.ingredients) ing on true
      cross join lateral (select (ing->>'ingredient_id')::uuid as iid) x
      left join pantry on pantry.ingredient_id = x.iid
      left join staple on staple.id = x.iid
      where x.iid is not null
        and rec.reusable
        and (p_meal_type is null or rec.meal_types @> array[p_meal_type])
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
      group by rec.id
    )
    select * from scored
    where missing <= 2 and mc >= 1
    order by missing asc, mc desc, created_at desc
  loop
    exit when n >= p_limit;
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
    match_count := r.mc; missing_count := r.missing;
    v_picked := v_picked || r.id;
    n := n + 1;
    return next;
  end loop;

  -- Pasada B: fallback por preferencias+franja (ignora la despensa).
  if n < p_limit then
    for r in
      with pantry as (
        select ingredient_id from pantry_items
        where user_id = v_uid and ingredient_id is not null
      ),
      staple as (
        select id from ingredients
        where category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
      ),
      scored as (
        select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
               rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
               count(distinct x.iid) filter (where pantry.ingredient_id is not null)::int as mc,
               count(distinct x.iid) filter (where pantry.ingredient_id is null and staple.id is null)::int as missing
        from recipes rec
        join lateral jsonb_array_elements(rec.ingredients) ing on true
        cross join lateral (select (ing->>'ingredient_id')::uuid as iid) x
        left join pantry on pantry.ingredient_id = x.iid
        left join staple on staple.id = x.iid
        where rec.reusable
          and (p_meal_type is null or rec.meal_types @> array[p_meal_type])
          and (cardinality(v_exclude_allergens) = 0
               or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
          and (cardinality(v_require_diet) = 0
               or (rec.diet is not null and rec.diet @> v_require_diet))
          and rec.id <> all(p_exclude)
          and rec.id <> all(v_picked)
        group by rec.id
      )
      select * from scored
      order by created_at desc
    loop
      exit when n >= p_limit;
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
      match_count := r.mc; missing_count := r.missing;
      n := n + 1;
      return next;
    end loop;
  end if;
end;
$$;

grant execute on function recommended_recipes(int, text, uuid[]) to authenticated;
```

- [ ] **Step 2: Aplicar a la Supabase local**

Run: `supabase migration up`
Expected: aplica `0025_recommended_recipes_v2` sin error.

- [ ] **Step 3: Verificar firma de la función**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\df recommended_recipes"`
Expected: una sola función con argumentos `p_limit integer, p_meal_type text, p_exclude uuid[]`.

- [ ] **Step 4: Smoke test funcional (simulando usuario autenticado)**

Sustituye `<USER_UUID>` por un usuario que tenga items en `pantry_items`.

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<USER_UUID>"}';
select id, match_count, missing_count from recommended_recipes(6, null, '{}');
rollback;
SQL
```
Expected: devuelve filas sin error; `missing_count <= 2` en las que salgan por despensa. Con `null` de franja no filtra por franja (útil hasta que haya backfill).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0025_recommended_recipes_v2.sql
git commit -m "feat(db): recommended_recipes v2 (franja, preferencias, fallback)"
```

---

## Task 3: `meal_types` en el pipeline de generación

**Files:**
- Modify: `supabase/functions/_shared/preferences.ts`
- Modify: `supabase/functions/_shared/gemini.ts`
- Modify: `supabase/functions/_shared/recipes.ts`

- [ ] **Step 1: Añadir el vocabulario de franjas**

En `supabase/functions/_shared/preferences.ts`, tras `export const DIET_KEYS = ['vegan', 'vegetarian'];`, añade:

```ts
export const MEAL_TYPE_KEYS = ['desayuno', 'almuerzo', 'merienda', 'cena'];
```

- [ ] **Step 2: Añadir `meal_types` al tipo y schema de Gemini**

En `supabase/functions/_shared/gemini.ts`, en la interfaz `GeneratedRecipe`, añade tras `diet?: string[];`:

```ts
  meal_types?: string[];
```

En `RECIPE_SCHEMA.properties`, añade tras `diet: { type: 'ARRAY', items: { type: 'STRING' } },`:

```ts
    meal_types: { type: 'ARRAY', items: { type: 'STRING' } },
```

En el array `required` de `RECIPE_SCHEMA`, añade `'meal_types'` (tras `'diet'`).

- [ ] **Step 3: Instruir la clasificación en el prompt**

En `supabase/functions/_shared/gemini.ts`, dentro de `generateRecipe`, añade al final del `prompt` (antes del punto final de la última frase de `diet`):

```ts
    ` En "meal_types" indica en qué momentos del día encaja el plato, usando SOLO estas claves` +
    ` (una receta puede valer para varias): desayuno, almuerzo, merienda, cena.`;
```

Concretamente, cambia el cierre `incluye ambas).\`;` de la última línea por `incluye ambas).\`` (sin cerrar la sentencia) y añade la línea de `meal_types` arriba como cierre con `;`.

- [ ] **Step 4: Mapear y persistir `meal_types`**

En `supabase/functions/_shared/recipes.ts`:

Cambia el import de preferencias:
```ts
import { ALLERGEN_KEYS, DIET_KEYS, MEAL_TYPE_KEYS, sanitizeKeys } from './preferences.ts';
```

En la interfaz `RecipeData`, añade tras `diet?: string[] | null;`:
```ts
  meal_types?: string[] | null;
```

En `recipeFromGenerated`, añade tras `diet: sanitizeKeys(g.diet, DIET_KEYS),`:
```ts
    meal_types: sanitizeKeys(g.meal_types, MEAL_TYPE_KEYS),
```

En `saveRecipe`, en el objeto de `.insert({...})`, añade tras `diet: recipe.diet ?? null,`:
```ts
      meal_types: recipe.meal_types ?? [],
```

- [ ] **Step 5: Verificar tipos (Deno)**

Run: `deno check supabase/functions/_shared/gemini.ts supabase/functions/_shared/recipes.ts supabase/functions/_shared/preferences.ts`
Expected: sin errores de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/preferences.ts supabase/functions/_shared/gemini.ts supabase/functions/_shared/recipes.ts
git commit -m "feat(ai): clasificar meal_types al generar recetas"
```

---

## Task 4: Backfill de `meal_types` en el pool actual

**Files:**
- Create: `scripts/backfill-meal-types.mjs`

- [ ] **Step 1: Escribir el script one-off**

Lee las recetas con `meal_types` vacío (service role), las clasifica con Gemini y actualiza. Espeja `MEAL_TYPE_KEYS`.

```js
// Backfill one-off: clasifica en meal_types (desayuno/almuerzo/merienda/cena) las recetas
// del pool que aún no lo tengan. No forma parte del runtime.
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   GEMINI_API_KEY=<key> \
//   node scripts/backfill-meal-types.mjs

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!url || !serviceKey || !geminiKey) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y/o GEMINI_API_KEY.');
  process.exit(1);
}

const MEAL_TYPE_KEYS = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const GEN_MODEL = 'gemini-flash-lite-latest';
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const SCHEMA = {
  type: 'OBJECT',
  properties: { meal_types: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['meal_types'],
};

async function classify(recipe) {
  const prompt =
    `Clasifica en qué momentos del día encaja este plato español. Usa SOLO estas claves ` +
    `(una receta puede valer para varias): desayuno, almuerzo, merienda, cena.\n` +
    `Título: ${recipe.title}\nDescripción: ${recipe.description ?? ''}\n` +
    `Etiquetas: ${(recipe.tags ?? []).join(', ')}`;
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
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text);
  const seen = new Set(MEAL_TYPE_KEYS);
  return [...new Set((parsed.meal_types ?? []).map((m) => String(m).toLowerCase().trim()))].filter((m) =>
    seen.has(m),
  );
}

const listRes = await fetch(
  `${rest}/recipes?select=id,title,description,tags&meal_types=eq.{}`,
  { headers },
);
if (!listRes.ok) {
  console.error(`No se pudieron leer recetas: ${listRes.status} ${await listRes.text()}`);
  process.exit(1);
}
const recipes = await listRes.json();
console.log(`Recetas por clasificar: ${recipes.length}`);

let ok = 0;
let failed = 0;
for (const recipe of recipes) {
  try {
    const meal_types = await classify(recipe);
    const patch = await fetch(`${rest}/recipes?id=eq.${recipe.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ meal_types }),
    });
    if (!patch.ok) throw new Error(`PATCH ${patch.status}: ${await patch.text()}`);
    ok++;
    console.log(`OK  ${recipe.title} -> [${meal_types.join(', ')}]`);
  } catch (e) {
    failed++;
    console.error(`XX  ${recipe.title} -> ${e.message}`);
  }
}
console.log(`Hecho. OK=${ok} FAILED=${failed}`);
```

Nota sobre el filtro `meal_types=eq.{}`: PostgREST compara el array vacío. Si tu instancia no acepta esa sintaxis, usa `meal_types=eq.%7B%7D` (URL-encoded) — es lo mismo.

- [ ] **Step 2: Ejecutar el backfill (local o entorno con datos)**

Run:
```bash
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> GEMINI_API_KEY=<key> \
  node scripts/backfill-meal-types.mjs
```
Expected: imprime cada receta con sus franjas y `Hecho. OK=N FAILED=0`.

- [ ] **Step 3: Verificar en la base**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) filter (where cardinality(meal_types)=0) as sin_franja, count(*) as total from recipes;"`
Expected: `sin_franja` = 0 (o solo las que la IA no supo clasificar).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-meal-types.mjs
git commit -m "chore(scripts): backfill de meal_types del pool con Gemini"
```

---

## Task 5: Tipo y firma en `lib/recipes.ts`

**Files:**
- Modify: `apps/mobile/src/lib/recipes.ts`

- [ ] **Step 1: Ampliar el tipo y la firma**

En `apps/mobile/src/lib/recipes.ts`, sustituye la interfaz `RecommendedRecipe` y la función `recommendedRecipes` por:

```ts
export type MealType = 'desayuno' | 'almuerzo' | 'merienda' | 'cena';

export interface RecommendedRecipe {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  prep_time_min: number;
  cook_time_min: number;
  tags: string[];
  match_count: number;
  missing_count: number;
}

// Recetas sugeridas de la Home: por despensa (casi completo) y preferencias, filtradas por
// la franja del día. `exclude` son ids ya mostrados, para rotar en el pull-to-refresh.
export async function recommendedRecipes(
  mealType: MealType,
  exclude: string[] = [],
  limit = 6,
): Promise<RecommendedRecipe[]> {
  const { data, error } = await supabase.rpc('recommended_recipes', {
    p_limit: limit,
    p_meal_type: mealType,
    p_exclude: exclude,
  });
  if (error) throw error;
  return (data as RecommendedRecipe[]) ?? [];
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: falla SOLO en `use-home.ts` (aún llama a `recommendedRecipes()` sin el argumento de franja, ahora obligatorio). Se arregla en la Task 7. `home-suggestions.tsx` sigue compilando (usa `match_count`, que se mantiene, hasta la Task 8).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/recipes.ts
git commit -m "feat(recipes): recommendedRecipes por franja + missing_count"
```

---

## Task 6: Utilidades de franja horaria

**Files:**
- Create: `apps/mobile/src/features/home/meal-time.ts`

- [ ] **Step 1: Escribir las utilidades puras**

Franjas: desayuno 05–11:59 · almuerzo 12–16:59 · merienda 17–19:59 · cena 20–04:59.

```ts
import type { MealType } from '@/lib/recipes';

// Franja del día según la hora local (desayuno/almuerzo/merienda/cena).
export function currentMealType(date: Date): MealType {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'desayuno';
  if (h >= 12 && h < 17) return 'almuerzo';
  if (h >= 17 && h < 20) return 'merienda';
  return 'cena';
}

// Saludo por franja: mañana / tarde (incluye merienda) / noche.
export function greeting(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

// Etiqueta para el título de sección ("Ideas para tu {label}").
export function mealLabel(meal: MealType): string {
  return meal;
}
```

- [ ] **Step 2: Verificación manual rápida**

Run:
```bash
node -e "const f=(h)=>{if(h>=5&&h<12)return 'desayuno';if(h>=12&&h<17)return 'almuerzo';if(h>=17&&h<20)return 'merienda';return 'cena';}; [7,13,18,22,3].forEach(h=>console.log(h, f(h)))"
```
Expected: `7 desayuno`, `13 almuerzo`, `18 merienda`, `22 cena`, `3 cena`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/home/meal-time.ts
git commit -m "feat(home): utilidades de franja horaria y saludo"
```

---

## Task 7: Hook `use-home` con franja, rotación y refresh

**Files:**
- Modify: `apps/mobile/src/features/home/hooks/use-home.ts`

- [ ] **Step 1: Introducir franja, ids vistos y refresh**

Cambia los imports superiores para incluir la franja:

```ts
import { addIngredientsToShopping, recommendedRecipes, type MealType, type RecommendedRecipe } from '@/lib/recipes';
import { currentMealType, greeting } from '@/features/home/meal-time';
```

Dentro de `useHome`, añade estado tras `const [loadingSuggestions, setLoadingSuggestions] = useState(true);`:

```ts
  const [refreshing, setRefreshing] = useState(false);
  const [meal, setMeal] = useState<MealType>(() => currentMealType(new Date()));
  // Ids ya mostrados en esta sesión, para traer nuevas en el pull-to-refresh.
  const seen = useRef<Set<string>>(new Set());
```

Sustituye la función `load` completa por:

```ts
  const fetchSuggestions = useCallback((mealType: MealType, exclude: string[]) => {
    return recommendedRecipes(mealType, exclude).then((data) => {
      data.forEach((recipe) => seen.current.add(recipe.id));
      return data;
    });
  }, []);

  const load = useCallback(() => {
    let active = true;
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    seen.current.clear();
    setLoadingSuggestions(true);
    setAddedLow(false);
    fetchSuggestions(mealType, [])
      .then((data) => {
        if (active) setSuggestions(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingSuggestions(false);
      });
    getPantrySummary()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    listFavorites()
      .then((favorites) => {
        if (active) setSaved(new Set(favorites.map((favorite) => favorite.id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchSuggestions]);

  useFocusEffect(load);

  // Pull-to-refresh: trae otras recetas excluyendo las ya vistas; si se agotan, reinicia.
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    try {
      let data = await fetchSuggestions(mealType, Array.from(seen.current));
      if (data.length === 0) {
        seen.current.clear();
        data = await fetchSuggestions(mealType, []);
      }
      if (data.length > 0) setSuggestions(data);
    } catch {
      // se ignora; el usuario puede reintentar
    } finally {
      setRefreshing(false);
    }
  }
```

En el `return` del hook, añade `refreshing`, `refresh`, `meal` y `greetingText`:

```ts
  return {
    suggestions,
    loadingSuggestions,
    refreshing,
    refresh,
    meal,
    greetingText: greeting(new Date()),
    pantry,
    addingLow,
    addedLow,
    saved,
    toggleSave,
    addLowToShopping,
  };
```

Nota: al llamar `fetchSuggestions` dentro de `refresh`, éste ya añade los ids nuevos a `seen`, de modo que un segundo tirón excluye también los recién mostrados.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: pasa limpio. `index.tsx` sigue desestructurando un subconjunto de lo que devuelve el hook (los campos nuevos son opcionales de consumir), así que compila hasta que la Task 9 los use.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/home/hooks/use-home.ts
git commit -m "feat(home): franja del día, rotación de vistas y pull-to-refresh"
```

---

## Task 8: Badge por `missing_count`

**Files:**
- Modify: `apps/mobile/src/features/home/components/home-suggestions.tsx`

- [ ] **Step 1: Cambiar el badge de la tarjeta**

En `apps/mobile/src/features/home/components/home-suggestions.tsx`, sustituye la función `toCardData` por:

```ts
function toCardData(recipe: RecommendedRecipe): RecipeCardData {
  const total = recipe.prep_time_min + recipe.cook_time_min;
  const cookable = recipe.missing_count === 0;
  return {
    id: recipe.id,
    image: recipe.image_url,
    badgeIcon: cookable ? 'check-circle' : 'shopping-cart',
    badge: cookable ? 'LISTA PARA COCINAR' : `TE FALTAN ${recipe.missing_count}`,
    title: recipe.title,
    description: recipe.description,
    tags: [...recipe.tags.slice(0, 2).map((t) => t.toUpperCase()), `${total} MIN`],
  };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: el error de `home-suggestions.tsx` desaparece; puede seguir el de `index.tsx` (Task 9).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/home/components/home-suggestions.tsx
git commit -m "feat(home): badge según ingredientes que faltan"
```

---

## Task 9: Saludo/título dinámicos y pull-to-refresh en la pantalla

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/index.tsx`

- [ ] **Step 1: Consumir lo nuevo del hook y añadir `RefreshControl`**

En `apps/mobile/src/app/(tabs)/index.tsx`:

Añade `RefreshControl` al import de `react-native`:
```ts
import { RefreshControl, ScrollView, Text, View } from 'react-native';
```

Añade el color del tema tras los imports (para el spinner del refresh):
```ts
const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;
```

Cambia el destructuring del hook:
```ts
  const {
    suggestions,
    loadingSuggestions,
    refreshing,
    refresh,
    meal,
    greetingText,
    pantry,
    addingLow,
    addedLow,
    saved,
    toggleSave,
    addLowToShopping,
  } = useHome();
```

Añade la prop `refreshControl` al `ScrollView`:
```tsx
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pb-section-gap pt-stack-lg gap-section-gap"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }>
```

Sustituye el saludo fijo por el dinámico:
```tsx
          <Text className="font-mono-medium text-label-md uppercase tracking-widest text-secondary">
            {greetingText}, chef
          </Text>
```

Sustituye el header de la sección de sugeridas por el título por franja:
```tsx
          <HomeSectionHeader title={`Ideas para tu ${meal}`} />
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificar en el dev-client**

Arranca la app (dev build; ver memoria "Dev build") y comprueba:
- El saludo cambia con la hora (o forzando la hora del dispositivo).
- El título de la sección dice "Ideas para tu {franja}".
- Con despensa poblada, salen recetas con badge "LISTA PARA COCINAR" o "TE FALTAN N".
- Tirar hacia abajo (pull-to-refresh) muestra la flecha circular y trae otras recetas.
- Con despensa vacía, siguen saliendo sugeridas (fallback por preferencias) en vez del estado vacío.

Run: `pnpm --filter @recetas/mobile start --dev-client`
Expected: la Home se comporta como arriba.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/src/app/(tabs)/index.tsx"
git commit -m "feat(home): saludo y título por franja + pull-to-refresh"
```

---

## Cierre

- [ ] **Abrir PR y revisión** (flujo obligatorio del proyecto)

```bash
gh pr create --base main --head feat/home-recetas-sugeridas \
  --title "feat: recetas sugeridas de la Home por despensa, preferencias y franja" \
  --body "Ver docs/superpowers/specs/2026-07-22-home-recetas-sugeridas-design.md"
```
Lanzar el agente revisor (code-reviewer / `/code-review`) sobre el diff. Corregir hallazgos en la rama y re-revisar. Pedir confirmación antes de mergear.

---

## Notas de verificación (resumen)

- **DB:** `supabase migration up`, `\df recommended_recipes`, smoke test psql con `request.jwt.claims`.
- **Edge (Deno):** `deno check` sobre los `_shared/*` tocados.
- **Móvil (TS):** `pnpm --filter @recetas/mobile exec tsc --noEmit` tras cada tarea de cliente.
- **E2E:** dev-client, según Task 9 Step 3.
