# Personalización por gustos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recomendar recetas del estilo que le gusta al hogar (favoritas o valoradas ≥4), aplicando afinidad de gusto como desempate en el motor (chat + Home), como lean en el descubrimiento de la Home, y como un carrusel "Para ti" dedicado.

**Architecture:** Afinidad = máx similitud coseno entre una receta y las recetas semilla del hogar, calculada en SQL con `recipes.embedding` (vector 768, índice ivfflat). Se inyecta en el snapshot del motor y en una RPC nueva para el carrusel. Cold start (sin semillas) = afinidad 0, todo igual que hoy.

**Tech Stack:** Supabase (Postgres + pgvector, Deno Edge Functions), pgTAP, Expo/React Native.

Spec: `docs/superpowers/specs/2026-07-25-taste-personalization-design.md`.

Rama: `feat/taste-personalization`. PR A = Tasks 1-3 (backend, entra con `db push`). PR B = Task 4 (móvil, rebuild).

---

## Estructura de ficheros

- Create `supabase/migrations/0065_recommendation_taste_affinity.sql` — reemplaza `build_household_recommendation_snapshot` (añade `tasteAffinity` a cada recipeInput) y `evaluate_recommendation_snapshot` (copia `tasteAffinity` al score y lo añade al ORDER BY).
- Create `supabase/migrations/0066_household_taste_recommendations.sql` — RPC nueva del carrusel.
- Create `supabase/migrations/0067_today_discover_taste_lean.sql` — reemplaza `household_today_decision` (descubrimiento con azar ponderado por gusto).
- Create `supabase/tests/0012_taste_personalization.test.sql` — pgTAP del desempate del motor y de la RPC del carrusel.
- Modify (Task 4, PR B) Home móvil: nueva sección carrusel "Para ti".

---

### Task 1: `tasteAffinity` en el motor (migración 0065)

**Files:**
- Create: `supabase/migrations/0065_recommendation_taste_affinity.sql`

**Contexto:** `build_household_recommendation_snapshot` está definida en `supabase/migrations/0053_recommendation_decision.sql:354-532`; `evaluate_recommendation_snapshot` en `supabase/migrations/0056_recommendation_pantry_first.sql:3-323`. Esta migración las **reemplaza** (`create or replace`) copiando su cuerpo actual y aplicando SOLO los cambios de abajo. No cambian firmas.

- [ ] **Step 1: Crear la migración copiando ambas funciones y aplicando los cambios**

Copia literal `build_household_recommendation_snapshot` de 0053 como `create or replace`. En el `jsonb_build_object` de cada recipeInput (0053:475, justo después de `'recipeId', r.id,`) añade el campo:

```sql
        'tasteAffinity', coalesce((
          select max(1 - (r.embedding <=> seed.embedding))
          from public.user_recipes ur
          join public.household_members hm2 on hm2.user_id = ur.user_id
          join public.recipes seed on seed.id = ur.recipe_id
          where hm2.household_id = p_household_id
            and (ur.is_favorite or ur.rating >= 4)
            and seed.embedding is not null
            and r.embedding is not null
        ), 0),
```

Copia literal `evaluate_recommendation_snapshot` de 0056 como `create or replace`. Dos cambios:

1. En el `jsonb_build_object` del `score` (0056:285-289), añade `tasteAffinity` (leído del recipeInput `v_recipe`):

```sql
      'score', jsonb_build_object(
        'priorityUsage', least(v_priority, 1), 'consumeSoonUsage', least(v_consume_soon, 1),
        'seasonalAffinity', v_seasonal, 'mealTypeMatch', v_meal,
        'availabilityRatio', v_availability, 'missingIngredientCount', v_missing_count,
        'tasteAffinity', coalesce((v_recipe->>'tasteAffinity')::numeric, 0)
      ),
```

2. En el `ORDER BY` del `jsonb_agg` (0056:294-302), añade `tasteAffinity desc` antes de `value->>'recipeId'`:

```sql
  select coalesce(jsonb_agg(value order by
    ((value->'score'->>'missingIngredientCount')::integer),
    ((value->'score'->>'priorityUsage')::numeric) desc,
    ((value->'score'->>'consumeSoonUsage')::numeric) desc,
    ((value->'score'->>'seasonalAffinity')::numeric) desc,
    ((value->'score'->>'mealTypeMatch')::numeric) desc,
    ((value->'score'->>'availabilityRatio')::numeric) desc,
    ((value->'score'->>'tasteAffinity')::numeric) desc,
    value->>'recipeId'
  ), '[]'::jsonb) into v_sorted
  from jsonb_array_elements(v_candidates);
```

Cabecera de comentario: explica que `tasteAffinity` es máx coseno contra las recetas gustadas del hogar y entra como desempate bajo (no altera pantry-first).

- [ ] **Step 2: Aplicar en local**

Run: `supabase migration up --local`
Expected: aplica `0065_recommendation_taste_affinity.sql` sin error.

- [ ] **Step 3: Verificar que el snapshot trae tasteAffinity**

Run (usa un hogar cualquiera con datos):
```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select public.build_household_recommendation_snapshot((select household_id from household_members limit 1), (select user_id from household_members limit 1), now(), null)->'recipeInputs'->0->'tasteAffinity';"
```
Expected: un número (0 si no hay semillas), no error ni null.

- [ ] **Step 4: Correr la suite completa** (el test específico llega en Task 2)

Run: `pnpm test:db`
Expected: `Result: PASS` (los tests existentes de 0008/0009/0011 no deben romperse; el nuevo campo es aditivo).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0065_recommendation_taste_affinity.sql
git commit -m "feat: afinidad de gusto como desempate en el motor de recomendación"
```

---

### Task 2: RPC `household_taste_recommendations` + pgTAP (migraciones 0066 y test 0012)

**Files:**
- Create: `supabase/migrations/0066_household_taste_recommendations.sql`
- Create: `supabase/tests/0012_taste_personalization.test.sql`

**Contexto:** RPC del carrusel "Para ti". La llama el móvil directo con el JWT del usuario (patrón de `household_today_decision`: `security definer`, `auth.uid()`, grant a `authenticated`). El filtro de alérgenos/dieta reutiliza `need_allergen_map`/`pref_diet_map` (migr 0033) y la misma lista de needs mapeados que `build_household_recommendation_snapshot` (0053:401-404).

- [ ] **Step 1: Escribir el test pgTAP primero (fallará: función no existe)**

Crea `supabase/tests/0012_taste_personalization.test.sql`. Sigue el patrón de fixtures de `supabase/tests/0011_household_recipe_ranking.test.sql` (crea `auth.users` con id nuevo `...0903`, `user_preferences`, set del jwt claim). Fixtures y asserts:

- Usuario `...0903`, hogar derivado. `user_preferences` con `special_needs '{}'`, `food_prefs '{}'`.
- Tres recetas reusables con embedding **explícito** (vector 768) para controlar la similitud:
  - Semilla `S` (embedding `e_s`), marcada favorita por el usuario en `user_recipes`.
  - Receta `A` muy parecida a `S` (embedding casi igual a `e_s`).
  - Receta `B` muy distinta (embedding ortogonal).
  Para construir embeddings deterministas usa un vector 768 sencillo, p. ej. `S` y `A` = `('[1,0,0,...]')::vector` con A ligeramente perturbado, `B` = `('[0,1,0,...]')::vector`. Genera el literal con `array_to_string`/`repeat` o escríbelo con un helper SQL; documenta cómo.
  - Una cuarta receta `C` con un alérgeno (p. ej. `allergens = '{gluten}'`) parecida a `S`, para el test de seguridad.

`select plan(N)` acorde. Asserts:
1. `has_function('public','household_taste_recommendations', array['integer'], ...)` y `authenticated` puede EXECUTE, `anon` no.
2. Con la semilla `S` favorita: `household_taste_recommendations(12)` devuelve `A` **antes** que `B` (A más arriba en el array por afinidad).
3. La semilla `S` **no** aparece en el resultado (se excluye).
4. Con `special_needs` del usuario puesto a un valor que mapea a `gluten` (mira `need_allergen_map`; usa el `need` real que da `gluten`), la receta `C` (allergens gluten) se excluye del resultado.
5. Sin ninguna semilla (borra el favorito): `household_taste_recommendations(12)` = `'[]'::jsonb`.

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `pnpm test:db`
Expected: FALLA en 0012 (`household_taste_recommendations` no existe).

- [ ] **Step 3: Escribir la migración 0066**

```sql
-- Carrusel "Para ti": recetas reusables del catálogo más afines al estilo del hogar (máx coseno
-- contra las recetas que sus miembros marcaron favoritas o valoraron >=4), filtradas por
-- alérgenos/dieta del hogar. La llama el móvil directo con el JWT del usuario.
create function public.household_taste_recommendations(p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
  v_exclude_allergens text[] := '{}';
  v_require_diet text[] := '{}';
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'no autenticado' using errcode = '42501';
  end if;
  v_household_id := public.current_household_id();
  if v_household_id is null then
    raise exception 'hogar no encontrado' using errcode = '42501';
  end if;
  perform public.require_household_member(v_household_id);

  -- Alérgenos a excluir del hogar (mismo mapa y needs que build_household_recommendation_snapshot).
  select coalesce(array_agg(distinct m.allergen), '{}')
  into v_exclude_allergens
  from public.household_members hm
  join public.user_preferences up on up.user_id = hm.user_id
  cross join lateral unnest(up.special_needs) as need(value)
  join public.need_allergen_map m
    on m.need = need.value
   and m.need in (
     'Frutos secos', 'Cacahuete', 'Marisco', 'Pescado', 'Huevo', 'Leche', 'Soja',
     'Sésamo', 'Mostaza', 'Apio', 'Lactosa', 'Gluten / celiaquía', 'Sin cerdo', 'Sin alcohol'
   )
  where hm.household_id = v_household_id;

  -- Dietas requeridas del usuario que pide.
  select coalesce(array_agg(distinct d.diet), '{}')
  into v_require_diet
  from public.user_preferences up
  cross join lateral unnest(up.food_prefs) as pref(value)
  join public.pref_diet_map d on d.pref = pref.value
  where up.user_id = v_user_id;

  -- `scored` calcula card+afinidad; `top` filtra sin afinidad y recorta a las p_limit más afines
  -- ANTES de agregar (el limit debe ir en subconsulta, no sobre el jsonb_agg).
  select coalesce(jsonb_agg(card order by affinity desc), '[]'::jsonb)
  into v_result
  from (
    select card, affinity
    from (
      select
        jsonb_build_object(
          'recipeId', r.id, 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status,
          'mode', 'discover', 'missingIngredientCount', null, 'reasons', jsonb_build_array('taste_match')
        ) as card,
        (
          select max(1 - (r.embedding <=> seed.embedding))
          from public.user_recipes ur
          join public.household_members hm on hm.user_id = ur.user_id
          join public.recipes seed on seed.id = ur.recipe_id
          where hm.household_id = v_household_id
            and (ur.is_favorite or ur.rating >= 4)
            and seed.embedding is not null
        ) as affinity
      from public.recipes r
      where r.reusable
        and r.embedding is not null
        and not exists (
          select 1 from public.user_recipes ur2
          join public.household_members hm3 on hm3.user_id = ur2.user_id
          where hm3.household_id = v_household_id
            and ur2.recipe_id = r.id
            and (ur2.is_favorite or ur2.rating >= 4)
        )
        and (cardinality(v_exclude_allergens) = 0
             or r.allergens is null
             or not (r.allergens && v_exclude_allergens))
        and (cardinality(v_require_diet) = 0 or r.diet @> v_require_diet)
    ) scored
    where affinity is not null
    order by affinity desc
    limit p_limit
  ) top;

  return v_result;
end;
$$;

revoke execute on function public.household_taste_recommendations(integer) from public, anon;
grant execute on function public.household_taste_recommendations(integer) to authenticated;
```

- [ ] **Step 4: Aplicar y correr los tests hasta verde**

Run: `supabase migration up --local && pnpm test:db`
Expected: `Result: PASS`, incluido 0012. Ajusta el test o la función hasta que pase. Corre `pnpm test:db` 2 veces (el ranking por afinidad es determinista; no debe flakear).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0066_household_taste_recommendations.sql supabase/tests/0012_taste_personalization.test.sql
git commit -m "feat: RPC household_taste_recommendations para el carrusel Para ti"
```

---

### Task 3: Descubrimiento de la Home con lean por gusto (migración 0067)

**Files:**
- Create: `supabase/migrations/0067_today_discover_taste_lean.sql`

**Contexto:** `household_today_decision` está en `supabase/migrations/0062_today_variety.sql:6-167`. Esta migración la **reemplaza** copiando su cuerpo actual y cambiando SOLO el bloque `discover` (0062:132-152) para ordenar por azar ponderado con `tasteAffinity` (ya disponible en `candidate->'score'->>'tasteAffinity'` gracias a Task 1). El bloque pantry (destacada + alternativas) NO se toca.

- [ ] **Step 1: Crear la migración**

Copia literal `household_today_decision` de 0062. Sustituye el bloque discover (0062:132-152) por:

```sql
  -- Discover: una por tipo de cocina, con azar ponderado por gusto (tira hacia el estilo del hogar
  -- sin perder variedad), 5 al azar ponderado, sin las de pantry.
  select coalesce(jsonb_agg(card), '[]'::jsonb)
  into v_discover
  from (
    select card
    from (
      select distinct on (r.tags[1])
        jsonb_build_object(
          'recipeId', candidate->>'recipeId', 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status, 'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card,
        (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0) + 0.5 * random()) as weight
      from jsonb_array_elements(v_decision->'candidates') as candidate
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
      where not ((candidate->>'recipeId') = any(v_pantry_ids))
      order by r.tags[1], (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0) + 0.5 * random()) desc
    ) per_cuisine
    order by per_cuisine.weight desc
    limit 5
  ) picked;
```

Cabecera de comentario: household_today_decision v6, descubrimiento con lean por gusto; cold start (afinidad 0) = azar puro.

- [ ] **Step 2: Aplicar en local**

Run: `supabase migration up --local`
Expected: aplica `0067` sin error.

- [ ] **Step 3: Verificar que no rompe los invariantes de la Home**

Run: `pnpm test:db`
Expected: `Result: PASS`. En concreto `supabase/tests/0009_household_today_decision.test.sql` (discover no vacío, sin solape con pantry, una por cocina) sigue OK. Corre `pnpm test:db` 3 veces para confirmar que sigue sin flakear (el peso lleva `random()`, pero los invariantes de 0009 son estructurales).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0067_today_discover_taste_lean.sql
git commit -m "feat: descubrimiento de la Home con lean por gusto"
```

---

### Task 4: Carrusel "Para ti" en la Home (móvil — PR B)

**Files:**
- Modify: `apps/mobile/src/lib/recipes.ts` (añadir `tasteRecommendations()` que llama a la RPC)
- Modify: Home (`apps/mobile/src/features/home/...` y/o `apps/mobile/src/app/(tabs)/index.tsx`) — nueva sección carrusel.

**Contexto:** El móvil llama a las RPC del hogar con el cliente autenticado (mira cómo `apps/mobile/src/lib/recipes.ts` invoca `household_today_decision`, función `todayDecision`, y cómo la Home la consume vía su hook). Reutiliza el componente de card existente del descubrimiento.

- [ ] **Step 1: Añadir el fetch de la RPC**

En `apps/mobile/src/lib/recipes.ts`, junto a `todayDecision`, añade:

```ts
export async function tasteRecommendations(): Promise<DiscoverRecipeCard[]> {
  const { data, error } = await supabase.rpc('household_taste_recommendations', { p_limit: 12 });
  if (error) throw error;
  return (data ?? []) as DiscoverRecipeCard[];
}
```
Usa el mismo tipo de card que ya devuelve el bloque discover de `todayDecision` (localiza su tipo, p. ej. `DiscoverRecipeCard`/el shape de `discover[]`, y reúsalo; no crees un tipo nuevo si ya existe).

- [ ] **Step 2: Consumir en la Home**

En el hook de la Home (junto a la carga de `todayDecision`), añade una consulta a `tasteRecommendations()`. Renderiza una sección "Para ti" con un carrusel horizontal reusando el componente de card del descubrimiento. Si el array viene vacío, **no renderices la sección**. Colócala debajo del bloque descubrimiento.

- [ ] **Step 3: Verificar tipos y arranque**

Run: `pnpm --filter mobile typecheck` (o el script de typecheck del móvil; si no existe, `pnpm -w typecheck`).
Expected: sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat: carrusel Para ti en la Home"
```

---

## Notas de despliegue

- Tasks 1-3 (PR A): `supabase db push` (0065/0066/0067) → el chat y el descubrimiento personalizan al momento; la RPC del carrusel queda lista. Sin reinstalar APK.
- Task 4 (PR B): requiere rebuild de APK (EAS) para que el carrusel aparezca.
- Revisión por agente del diff de cada PR antes de mergear (flujo obligatorio del proyecto).
