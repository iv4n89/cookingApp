# Recomendación pantry-first + descubrimiento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Home priorice recetas que aprovechan la despensa (menos faltantes) y separe una sección de descubrimiento variado, sin tocar el catálogo.

**Architecture:** El motor `evaluate_recommendation_snapshot` reordena sus candidatas por nº de faltantes ascendente y devuelve más candidatas (tope 40). `household_today_decision` reparte esas candidatas seguras en dos pistas (`pantry`, `discover`) sin duplicar seguridad. La Home móvil muestra dos secciones. Se entrega en 3 PRs, cada uno con `create or replace` en una migración nueva (0053/0054 no se editan).

**Tech Stack:** Postgres/pgTAP (Supabase), TypeScript (`@recetas/shared`), React Native + Expo Router + NativeWind.

Spec: `docs/superpowers/specs/2026-07-24-recommendation-pantry-first-design.md`.

---

## PR A — Motor: reordenar por faltantes + subir tope

Rama: `feat/recommendation-pantry-first` (ya creada; contiene el spec).

### File Structure (PR A)

- Create: `supabase/migrations/0056_recommendation_pantry_first.sql` — `create or replace function public.evaluate_recommendation_snapshot(...)` con dos cambios sobre el cuerpo actual de `0053`.
- Modify: `supabase/tests/0008_recommendation_decision.test.sql` — asserts del nuevo orden.

### Task A1: Migración de reordenado + tope

**Files:**
- Create: `supabase/migrations/0056_recommendation_pantry_first.sql`

- [ ] **Step 1: Crear la migración**

Copia el cuerpo COMPLETO de la función `public.evaluate_recommendation_snapshot(p_snapshot jsonb, p_alternative_limit integer default 5)` tal como está en `supabase/migrations/0053_recommendation_decision.sql` (desde `create function public.evaluate_recommendation_snapshot(` hasta su `$$;`), pégalo en el nuevo fichero cambiando la primera línea a `create or replace function`, y aplica EXACTAMENTE estos dos cambios:

Cambio 1 — el tope de candidatas (declaración de `v_limit`). Sustituye:
```sql
  v_limit integer := greatest(least(coalesce(p_alternative_limit, 5), 10), 0) + 1;
```
por:
```sql
  v_limit integer := greatest(least(coalesce(p_alternative_limit, 5), 40), 0) + 1;
```

Cambio 2 — el orden de las candidatas. Sustituye el bloque:
```sql
  select coalesce(jsonb_agg(value order by
    (value->>'mode' = 'cook_now') desc,
    ((value->'score'->>'priorityUsage')::numeric) desc,
    ((value->'score'->>'consumeSoonUsage')::numeric) desc,
    ((value->'score'->>'seasonalAffinity')::numeric) desc,
    ((value->'score'->>'mealTypeMatch')::numeric) desc,
    ((value->'score'->>'availabilityRatio')::numeric) desc,
    ((value->'score'->>'missingIngredientCount')::integer),
    value->>'recipeId'
  ), '[]'::jsonb) into v_sorted
  from jsonb_array_elements(v_candidates);
```
por (el nº de faltantes pasa a ser el criterio principal; se elimina el flag `cook_now` porque `missing = 0` equivale a cocinable ya):
```sql
  select coalesce(jsonb_agg(value order by
    ((value->'score'->>'missingIngredientCount')::integer),
    ((value->'score'->>'priorityUsage')::numeric) desc,
    ((value->'score'->>'consumeSoonUsage')::numeric) desc,
    ((value->'score'->>'seasonalAffinity')::numeric) desc,
    ((value->'score'->>'mealTypeMatch')::numeric) desc,
    ((value->'score'->>'availabilityRatio')::numeric) desc,
    value->>'recipeId'
  ), '[]'::jsonb) into v_sorted
  from jsonb_array_elements(v_candidates);
```

Añade al principio del fichero un comentario de una línea:
```sql
-- Reordena la decisión para priorizar el aprovechamiento de la despensa (menos faltantes primero)
-- y amplía el tope de candidatas para que la Home pueda separar despensa y descubrimiento.
```

No cambies nada más del cuerpo.

- [ ] **Step 2: Aplicar y comprobar que compila**

Run: `supabase db reset --local`
Expected: aplica hasta `0056` sin errores (`Finished supabase db reset`).

- [ ] **Step 3: Restaurar datos de desarrollo**

El reset vacía la base. Restaura el backup del usuario (si existe uno reciente en el scratchpad de la sesión). Si no hay backup, continúa: los tests pgTAP no dependen de esos datos.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0056_recommendation_pantry_first.sql
git commit -m "feat: motor prioriza despensa (menos faltantes) y sube tope de candidatas"
```

### Task A2: Actualizar contratos pgTAP del orden

**Files:**
- Modify: `supabase/tests/0008_recommendation_decision.test.sql`

- [ ] **Step 1: Ejecutar la suite y localizar fallos de orden**

Run: `pnpm test:db`
Expected: `0008` puede fallar en asserts que dependen del orden anterior (p. ej. los que comprueban `candidates->0` esperando la de más `priorityUsage` cuando ahora gana la de menos faltantes). Anota los números de assert que fallan y su descripción.

- [ ] **Step 2: Añadir un contrato explícito del nuevo orden**

Localiza en `0008` el bloque que evalúa `evaluate_recommendation_snapshot` con un snapshot que tenga al menos dos recetas: una con 0 faltantes y otra con faltantes >0 (o créalo si no existe, modelándolo sobre los snapshots ya presentes en el archivo). Añade un assert que fije el criterio nuevo, incrementando el `plan(N)` en el número de asserts añadidos:

```sql
select is(
  (public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', jsonb_build_array(
        jsonb_build_object(
          'recipeId', 'recipe-buy-two', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-a','canonicalIngredientId',null,'canonicalName','harina','name','Harina','requiredQuantity',1,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-b','canonicalIngredientId',null,'canonicalName','tomate','name','Tomate','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        ),
        jsonb_build_object(
          'recipeId', 'recipe-ready', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-salt','canonicalIngredientId',null,'canonicalName','sal marina','name','Sal marina','requiredQuantity',1,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        )
      )
    ), 5
  )->'candidates'->0->>'recipeId'),
  'recipe-ready',
  'La receta cocinable con básicos (0 faltantes) se ordena antes que la que exige comprar'
);
```

Nota: `recipe-ready` solo usa sal marina, que entra en los básicos asumidos, así que tiene 0 faltantes; `recipe-buy-two` exige harina y tomate (no asumidos) → 2 faltantes. Con el nuevo orden, `candidates->0` debe ser `recipe-ready`.

- [ ] **Step 3: Reparar los asserts previos que dependían del orden viejo**

Para cada assert anotado en el Step 1, ajústalo al comportamiento real nuevo: inspecciona la salida real con `psql` usando el mismo snapshot del assert y corrige el valor esperado (o el índice de candidata) para que refleje el orden pantry-first. No cambies la RPC. Si un assert ya no tiene sentido con el nuevo orden, reescríbelo para comprobar la propiedad equivalente correcta.

- [ ] **Step 4: Suite en verde**

Run: `pnpm test:db`
Expected: `All tests successful`, `Result: PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/0008_recommendation_decision.test.sql
git commit -m "test: fijar el orden pantry-first del motor"
```

### Task A3: PR A + revisión + merge

- [ ] Push, `gh pr create`, revisión con `code-reviewer` sobre el diff, corregir en la rama, y merge con confirmación del usuario (squash + borrar rama). Luego `git switch main && git pull`.

---

## PR B — DTO `household_today_decision`: pistas pantry/discover

Rama nueva desde `main`: `feat/today-pantry-discover`.

### File Structure (PR B)

- Modify: `packages/shared/src/types.ts` — DTO `TodayDecision` (nueva forma) + `TodayRecipeCard` sin cambios.
- Create: `supabase/migrations/0057_today_pantry_discover.sql` — `create or replace function public.household_today_decision(...)`.
- Modify: `supabase/tests/0009_household_today_decision.test.sql` — asserts de `pantry`/`discover`.

### Task B1: DTO nuevo en `@recetas/shared`

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Reemplazar la interfaz `TodayDecision`**

En `packages/shared/src/types.ts`, sustituye la interfaz `TodayDecision` actual por:

```ts
export interface TodayPantryTrack {
  featured: TodayRecipeCard | null;
  alternatives: TodayRecipeCard[];
}

export interface TodayDecision {
  policyVersion: string;
  mealType: RecommendationMealType | null;
  decisionReason: RecommendationDecision["decisionReason"];
  priorityProducts: TodayPriorityProduct[];
  pantry: TodayPantryTrack;
  discover: TodayRecipeCard[];
}
```

Elimina la interfaz `TodayShoppingItem` si ya no la usa nadie más (búscala con grep en `apps/` y `packages/`; si solo aparecía en el DTO viejo, bórrala).

- [ ] **Step 2: Typecheck del paquete**

Run: `pnpm --filter @recetas/shared exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: DTO TodayDecision con pistas pantry y discover"
```

### Task B2: Migración `household_today_decision` v2

**Files:**
- Create: `supabase/migrations/0057_today_pantry_discover.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- household_today_decision v2: reparte las candidatas seguras del motor en dos pistas
-- (pantry = menos faltantes; discover = variedad por cocina) y expone los productos prioritarios.

create or replace function public.household_today_decision(
  p_meal_type text default null,
  p_alternative_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decision jsonb;
  v_priority jsonb;
  v_cards jsonb;
  v_featured jsonb;
  v_alternatives jsonb;
  v_discover jsonb;
  v_pantry_count integer := 5;  -- featured + 4 alternativas
begin
  -- Pide un conjunto amplio de candidatas seguras (ya ordenadas por menos faltantes).
  v_decision := public.household_recommendation_decision(p_meal_type, 30);

  -- Productos prioritarios: priority antes que consume_soon, luego más antiguos primero.
  select coalesce(jsonb_agg(product order by rank_key, age_days desc), '[]'::jsonb)
  into v_priority
  from (
    select
      jsonb_build_object(
        'name', s.ingredient_name,
        'status', s.status,
        'estimatedDate', case
          when s.acquired_at is not null and s.min_days is not null
          then (s.acquired_at + make_interval(days => s.min_days))
          else null
        end,
        'confidence', s.confidence
      ) as product,
      case s.status when 'priority' then 0 when 'consume_soon' then 1 else 2 end as rank_key,
      s.age_days
    from public.household_expiration_snapshot() s
    where s.status in ('priority', 'consume_soon')
  ) ranked;

  -- Tarjeta de pintado por candidata, conservando rango (orden = menos faltantes primero).
  select coalesce(jsonb_agg(card order by rk), '[]'::jsonb)
  into v_cards
  from (
    select
      (candidate->>'rank')::int as rk,
      jsonb_build_object(
        'recipeId', candidate->>'recipeId',
        'title', r.title,
        'imageUrl', r.image_url,
        'imageStatus', r.image_status,
        'mode', candidate->>'mode',
        'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
        'reasons', candidate->'reasonCodes'
      ) as card
    from jsonb_array_elements(v_decision->'candidates') as candidate
    join public.recipes r on r.id = (candidate->>'recipeId')::uuid
  ) c;

  -- Pista pantry: las primeras (menos faltantes).
  v_featured := v_cards->0;
  v_alternatives := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_cards) with ordinality
    where ordinality > 1 and ordinality <= v_pantry_count
  ), '[]'::jsonb);

  -- Pista discover: del resto, una por tipo de cocina (primer tag), hasta 5, por rango.
  -- Anidado: (1) una por cocina, (2) ordenar por rango y limitar a 5, (3) agregar.
  select coalesce(jsonb_agg(card order by rk), '[]'::jsonb)
  into v_discover
  from (
    select rk, card
    from (
      select distinct on (r.tags[1])
        (candidate->>'rank')::int as rk,
        jsonb_build_object(
          'recipeId', candidate->>'recipeId',
          'title', r.title,
          'imageUrl', r.image_url,
          'imageStatus', r.image_status,
          'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card
      from jsonb_array_elements(v_decision->'candidates') with ordinality as c(candidate, ord)
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
      where ord > v_pantry_count
      order by r.tags[1], (candidate->>'rank')::int
    ) per_cuisine
    order by rk
    limit 5
  ) picked;

  return jsonb_build_object(
    'policyVersion', v_decision->>'policyVersion',
    'mealType', v_decision->'mealType',
    'decisionReason', v_decision->>'decisionReason',
    'priorityProducts', coalesce(v_priority, '[]'::jsonb),
    'pantry', jsonb_build_object('featured', v_featured, 'alternatives', v_alternatives),
    'discover', coalesce(v_discover, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.household_today_decision(text, integer) from public, anon;
grant execute on function public.household_today_decision(text, integer) to authenticated;
```

Nota: `limit 5` fuera del `distinct on` requiere que el `distinct on` vaya en una subconsulta; por eso `picked` es subconsulta y el `limit` se aplica al `select ... from picked`. Verifica que la migración aplica sin error de sintaxis en el Step 2.

- [ ] **Step 2: Aplicar**

Run: `supabase db reset --local`
Expected: aplica hasta `0057` sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0057_today_pantry_discover.sql
git commit -m "feat: household_today_decision reparte pantry y discover"
```

### Task B3: pgTAP de pantry/discover

**Files:**
- Modify: `supabase/tests/0009_household_today_decision.test.sql`

- [ ] **Step 1: Adaptar los asserts existentes a la forma nueva**

En `0009`, los asserts que hoy leen `->'featured'` pasan a `->'pantry'->'featured'`. Sustituye cada `public.household_today_decision('cena',5)->'featured'` por `public.household_today_decision('cena',5)->'pantry'->'featured'` (mismo cambio para `->>'featured'`). El assert de tipo array de `alternatives` pasa a `->'pantry'->'alternatives'`.

- [ ] **Step 2: Añadir asserts de las dos pistas**

Con los fixtures ya presentes (receta 1 cook_now `...9301` y receta 2 shop_then_cook `...9302`), añade (incrementando `plan(N)`):

```sql
select is(
  public.household_today_decision('cena', 5)->'pantry'->'featured'->>'recipeId',
  '00000000-0000-0000-0000-000000009301',
  'La pista pantry destaca la receta de menos faltantes'
);

select is(
  jsonb_typeof(public.household_today_decision('cena', 5)->'discover'),
  'array',
  'discover es siempre un array'
);

select ok(
  not exists (
    select 1
    from jsonb_array_elements(public.household_today_decision('cena', 5)->'discover') d
    where d->>'recipeId' = public.household_today_decision('cena', 5)->'pantry'->'featured'->>'recipeId'
  ),
  'discover no repite la receta destacada de pantry'
);
```

- [ ] **Step 3: Suite en verde**

Run: `pnpm test:db`
Expected: `0009 ... ok`, `All tests successful`, `Result: PASS`.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/0009_household_today_decision.test.sql
git commit -m "test: contratos de pantry y discover en today"
```

### Task B4: PR B + revisión + merge

- [ ] Push, PR, revisión con `code-reviewer`, correcciones, merge con confirmación (squash + borrar rama), `git switch main && git pull`.

---

## PR C — Home móvil: secciones Aprovecha / Descubre

Rama nueva desde `main`: `feat/home-pantry-discover-ui`.

### File Structure (PR C)

- Modify: `apps/mobile/src/features/home/hooks/use-home.ts` — leer `pantry`/`discover`.
- Modify: `apps/mobile/src/app/(tabs)/index.tsx` — dos secciones.

### Task C1: `useHome` lee la forma nueva

**Files:**
- Modify: `apps/mobile/src/features/home/hooks/use-home.ts`

- [ ] **Step 1: Ajustar el marcado de imágenes y lo que expone el hook**

El hook ya consume `todayDecision()`. Actualiza `queueImages` para recorrer las tres fuentes de tarjetas y devolver el `decision` con ellas marcadas `pending`. Sustituye la función `queueImages` por:

```ts
  const queueImages = useCallback((data: TodayDecision): TodayDecision => {
    const mark = (card: TodayRecipeCard | null): TodayRecipeCard | null => {
      if (!card || card.imageUrl || card.imageStatus === 'pending') return card;
      if (!imageRequested.current.has(card.recipeId)) {
        imageRequested.current.add(card.recipeId);
        ensureRecipeImage(card.recipeId).catch(() => {});
      }
      return { ...card, imageStatus: 'pending' };
    };
    return {
      ...data,
      pantry: {
        featured: mark(data.pantry.featured),
        alternatives: data.pantry.alternatives.map((card) => mark(card) as TodayRecipeCard),
      },
      discover: data.discover.map((card) => mark(card) as TodayRecipeCard),
    };
  }, []);
```

El resto del hook (load, refresh, toggleSave, retorno `{ decision, loading, refreshing, refresh, meal, greetingText, saved, toggleSave }`) no cambia.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json`
Expected: PASS salvo errores esperados en `(tabs)/index.tsx` (usa la forma vieja); se corrige en C2.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/home/hooks/use-home.ts
git commit -m "feat: useHome consume pantry y discover"
```

### Task C2: Home con dos secciones

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/index.tsx`

- [ ] **Step 1: Reescribir las secciones de recetas**

En `(tabs)/index.tsx`, sustituye las variables derivadas y las secciones de recetas. Las variables:

```tsx
  const priority = decision?.priorityProducts ?? [];
  const featured = decision?.pantry.featured ?? null;
  const alternatives = decision?.pantry.alternatives ?? [];
  const discover = decision?.discover ?? [];
```

La sección "Cocina esto hoy" mantiene su lógica (usa `featured`, título `priority.length > 0 ? 'Aprovecha tu despensa' : \`Ideas para tu ${meal}\``). Renombra el título de la sección de alternativas y añade la de descubrimiento. Reemplaza el bloque de `alternatives` por:

```tsx
        {alternatives.length > 0 ? (
          <View>
            <HomeSectionHeader title="Más con tu despensa" />
            <View className="gap-gutter">
              {alternatives.map((card) => (
                <RecipeCard
                  key={card.recipeId}
                  recipe={toCardData(card)}
                  saved={saved.has(card.recipeId)}
                  onToggleSave={() => toggleSave(card.recipeId)}
                  onPress={() => openRecipe(card.recipeId)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {discover.length > 0 ? (
          <View>
            <HomeSectionHeader title="Descubre" />
            <View className="gap-gutter">
              {discover.map((card) => (
                <RecipeCard
                  key={card.recipeId}
                  recipe={toCardData(card)}
                  saved={saved.has(card.recipeId)}
                  onToggleSave={() => toggleSave(card.recipeId)}
                  onPress={() => openRecipe(card.recipeId)}
                />
              ))}
            </View>
          </View>
        ) : null}
```

`toCardData` ya existe en el fichero y no cambia.

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/(tabs)/index.tsx
git commit -m "feat: Home con secciones Aprovecha tu despensa y Descubre"
```

### Task C3: Prueba en dispositivo + PR

- [ ] Recorrido manual (servidores locales + dev build): con un crítico dentro de plazo, arriba las recetas que más aprovechan la despensa y abajo "Descubre" con variedad; imágenes cargan; pull-to-refresh y favoritos funcionan.
- [ ] Push, PR, revisión con `code-reviewer`, correcciones, merge con confirmación (squash + borrar rama).

---

## Notas de ejecución

- 0053/0054 NO se editan: los cambios van por `create or replace` en 0056/0057.
- Tras cada `supabase db reset`, restaurar el backup de datos del usuario desde el scratchpad de la sesión (los tests pgTAP no lo necesitan, pero la prueba móvil sí).
- Regla del repo: rama por PR, revisión con agente y confirmación del usuario antes de mergear a `main`.
