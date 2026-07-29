# Fase A — Variedad en el motor de recomendaciones

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar tarea a tarea. Los pasos
> usan casillas (`- [ ]`).

**Objetivo:** que la Home deje de mostrar siempre las mismas recetas, sin generar ni
una receta nueva.

**Arquitectura:** tres cambios en SQL. (1) El filtro de franja horaria pasa a aplicarse
al construir el snapshot, antes del corte de candidatas, en vez de después. (2) La
ventana de candidatas sube de 31 a 121. (3) El azar puro (`random()`) se sustituye por
una semilla determinista por hogar y día, de forma que el orden es estable durante el
día y distinto al siguiente; además, lo cocinado en los últimos 14 días baja al final.

**Stack:** PostgreSQL/plpgsql sobre Supabase, migraciones en `supabase/migrations/`,
tests pgTAP en `supabase/tests/` (`pnpm test:db`, requiere `supabase start` local).

**Spec:** `docs/superpowers/specs/2026-07-29-variedad-y-contenido-design.md`.

---

## Contexto: por qué se repiten las recetas

Verificado sobre el código, no supuesto. Tres causas encadenadas:

1. **La ventana de candidatas es 31 sobre 495 recetas.**
   `household_today_decision` llama a `household_recommendation_decision(p_meal_type, 30)`
   (`supabase/migrations/0072_today_priority_ingredient_id.sql:27`), y el evaluador
   recorta a `p_alternative_limit + 1`
   (`supabase/migrations/0065_recommendation_taste_affinity.sql:212` y `:506`). Todo lo
   que la Home enseña —destacada, 4 alternativas y las 5 de descubrir— sale de esas 31.

2. **Ese corte es determinista y siempre devuelve las mismas 31.** El orden final del
   evaluador (`0065:494-504`) es `missingIngredientCount` ascendente y, en último lugar,
   `value->>'recipeId'`. Con la despensa quieta, las 31 recetas con menos faltantes son
   siempre las mismas y en el mismo orden.

3. **El `random()` que se añadió en 0062 no ataca esa causa.** Solo baraja *dentro* de
   las 31 ya elegidas (`0072:58`, `:82`, `:108`, `:155`, `:159`). Encima lo hace en cada
   llamada, y la Home refresca al enfocar la pestaña
   (`apps/mobile/src/features/home/hooks/use-home.ts:91`), así que las tarjetas se
   rebarajan solas mientras el usuario mira. Peor de los dos mundos: inestable dentro
   del día e idéntico entre días.

Y una cuarta, que explica las recetas fuera de lugar:

4. **La franja horaria se filtra después del corte.** Dentro del evaluador `mealType`
   solo es un desempate en quinta posición (`0065:498`); el filtro duro está en
   `0072:74-75`, ya sobre las 31 supervivientes. Como el catálogo tiene 451 recetas de
   almuerzo y 53 de desayuno, a primera hora las 31 candidatas son casi todas de
   almuerzo, el filtro las tumba, salta el fallback de `0072:79-99` (que ignora la
   franja) y el desayuno acaba siendo un plato de comida.

## Estructura de archivos

- Crear: `supabase/migrations/0074_recommendation_rotation_seed.sql`
  — helper `rotation_fraction`, y `create or replace` de
  `build_household_recommendation_snapshot` (semilla + filtro de franja) y de
  `evaluate_recommendation_snapshot` (tope 200, desempate por semilla, semilla en la
  respuesta).
- Crear: `supabase/migrations/0075_today_variety_window.sql`
  — `create or replace` de `household_today_decision` (ventana 120, orden por semilla,
  penalización de lo cocinado).
- Modificar: `supabase/tests/0008_recommendation_decision.test.sql`
- Modificar: `supabase/tests/0009_household_today_decision.test.sql`

No se toca el cliente móvil: la RPC no cambia de firma ni de forma de respuesta.

## Decisiones tomadas (no volver a abrirlas)

- **Semilla por hogar y día natural en `Europe/Madrid`.** Estable dentro del día,
  distinta mañana. Se calcula en el constructor del snapshot, viaja dentro del snapshot
  y sale en la respuesta del evaluador, para que `household_today_decision` no tenga que
  recalcularla ni conocer el hogar.
- **El evaluador sigue siendo `immutable`.** La semilla entra como dato del snapshot; no
  se llama a `now()` ni a `random()` dentro. Esto es innegociable: romper la inmutabilidad
  invalida los tests puros de 0008 y el uso desde el chat.
- **El filtro de franja va en el constructor, no en el evaluador**, porque el constructor
  ya recibe `p_meal_type` (`0065`, firma `(uuid, uuid, timestamptz, text)`). El chat llama
  a `household_recipe_ranking` sin franja (`supabase/functions/_shared/recipe-pipeline.ts:311-316`,
  no manda `p_meal_type`), así que ahí no cambia nada.
- **Se mantiene el fallback sin franja de `0072:79-99`.** Con el filtro movido arriba
  dejará de dispararse en la práctica, pero sigue siendo la red de seguridad si un hogar
  se queda sin candidatas.
- **Penalización, no exclusión, de lo cocinado.** Lo cocinado en 14 días baja al final
  del orden; no se elimina. Con `cooked_recipes` a una fila en producción esto hoy casi
  no cambia nada, y así degrada solo cuando haya datos.
- **Sin tabla de impresiones.** Queda fuera de esta fase.

---

### Tarea 1: Helper de rotación determinista

**Archivos:**
- Crear: `supabase/migrations/0074_recommendation_rotation_seed.sql`
- Modificar: `supabase/tests/0008_recommendation_decision.test.sql`

- [ ] **Paso 1: Escribir el test que falla**

Añadir en `supabase/tests/0008_recommendation_decision.test.sql`, justo después del
bloque de `has_function` inicial (línea 8 aprox.):

```sql
select has_function('public', 'rotation_fraction', array['text', 'text'], 'Existe el helper de rotación');

select ok(
  public.rotation_fraction('semilla-a', 'receta-1') between 0 and 1,
  'La rotación devuelve una fracción entre 0 y 1'
);

select is(
  public.rotation_fraction('semilla-a', 'receta-1'),
  public.rotation_fraction('semilla-a', 'receta-1'),
  'La misma semilla y la misma receta dan siempre el mismo valor'
);

select isnt(
  public.rotation_fraction('semilla-a', 'receta-1'),
  public.rotation_fraction('semilla-b', 'receta-1'),
  'Cambiar de semilla cambia el valor de la misma receta'
);
```

Subir el plan: en la línea 3, `select plan(47);` pasa a `select plan(51);`.

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: falla con `function public.rotation_fraction(unknown, unknown) does not exist`.

- [ ] **Paso 3: Implementación mínima**

Crear `supabase/migrations/0074_recommendation_rotation_seed.sql` con esta cabecera y
el helper (el resto de la migración se añade en las tareas 2 y 3):

```sql
-- Variedad en la recomendación: una semilla por hogar y día sustituye al random() de 0062,
-- que barajaba solo dentro de las 31 candidatas ya elegidas y rebarajaba en cada refresco.
-- El corte de candidatas pasa a ser rotatorio, y la franja horaria se filtra al construir
-- el snapshot en vez de después del corte.

-- Convierte (semilla, clave) en una fracción estable de [0,1]. 7 dígitos hex = 28 bits,
-- que caben en un integer con signo sin desbordar.
create or replace function public.rotation_fraction(p_seed text, p_key text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (('x' || substr(md5(coalesce(p_seed, '') || coalesce(p_key, '')), 1, 7))::bit(28)::int)::numeric
    / 268435455;
$$;
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
pnpm test:db
```
Esperado: 51/51.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0074_recommendation_rotation_seed.sql supabase/tests/0008_recommendation_decision.test.sql
git commit -m "feat: añadir el helper de rotación determinista de recomendaciones"
```

---

### Tarea 2: Semilla, tope y franja en el evaluador y el constructor

**Archivos:**
- Modificar: `supabase/migrations/0074_recommendation_rotation_seed.sql`
- Modificar: `supabase/tests/0008_recommendation_decision.test.sql`

Las dos funciones se rehacen con `create or replace`, así que hay que **copiar la
definición vigente completa** al archivo nuevo y aplicarle los cambios listados. Las
definiciones vigentes son:
- `build_household_recommendation_snapshot`: `supabase/migrations/0065_recommendation_taste_affinity.sql`,
  desde `create or replace function public.build_household_recommendation_snapshot`
  hasta el `revoke` que la sigue (incluido).
- `evaluate_recommendation_snapshot`: `supabase/migrations/0065_recommendation_taste_affinity.sql:201`
  hasta el final de su cuerpo.

No reescribir el cuerpo a mano ni "mejorarlo": copiar y tocar solo lo indicado.

- [ ] **Paso 1: Escribir los tests que fallan**

Añadir al final de `supabase/tests/0008_recommendation_decision.test.sql`, antes de
`select * from finish();`:

```sql
-- La semilla viaja del snapshot a la respuesta: household_today_decision la reutiliza.
select is(
  public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'rotationSeed', 'semilla-fija',
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb, 'recipeInputs', '[]'::jsonb
    ), 5
  )->>'rotationSeed',
  'semilla-fija',
  'La semilla de rotación sale en la respuesta del evaluador'
);

-- Entre candidatas empatadas en todos los criterios, manda la semilla.
select is(
  (public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'rotationSeed', 'semilla-fija',
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', jsonb_build_array(
        jsonb_build_object('recipeId', 'a', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', '[]'::jsonb),
        jsonb_build_object('recipeId', 'b', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', '[]'::jsonb),
        jsonb_build_object('recipeId', 'c', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', '[]'::jsonb)
      )
    ), 5
  ))->>'selectedRecipeId',
  (select id from (values ('a'), ('b'), ('c')) t(id)
   order by public.rotation_fraction('semilla-fija', id) limit 1),
  'Entre empatadas, la principal es la que ordena la semilla'
);

-- El tope viejo (40 alternativas) dejaba fuera el 94% del catálogo.
select is(
  jsonb_array_length((public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'rotationSeed', 'semilla-fija',
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', (
        select jsonb_agg(jsonb_build_object(
          'recipeId', 'r' || g, 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high',
          'ingredients', '[]'::jsonb
        ))
        from generate_series(1, 80) g
      )
    ), 60
  ))->'candidates'),
  61,
  'Con 80 candidatas y límite 60 devuelve 61: el tope ya no se queda en 41'
);
```

Y añadir, dentro del bloque de fixtures del constructor de snapshot (el que ya existe
al final del archivo, alrededor de la línea 598, con hogar y recetas reales), estos dos
asertos. Reutilizar el hogar y las recetas de ese bloque; si no hay una receta exclusiva
de una franja, insertar una con `meal_types = array['desayuno']` y otra con
`array['cena']` antes de los asertos:

```sql
select is(
  (select count(*) from jsonb_array_elements(
    public.build_household_recommendation_snapshot(
      '00000000-0000-0000-0000-000000000801',
      '00000000-0000-0000-0000-000000000802',
      '2026-07-24T10:00:00Z'::timestamptz,
      'desayuno'
    )->'recipeInputs') ri
   where ri->'mealTypes' @> '["cena"]'::jsonb),
  0::bigint,
  'Pedir desayuno deja fuera del snapshot las recetas solo de cena'
);

select isnt(
  public.build_household_recommendation_snapshot(
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000802',
    '2026-07-24T10:00:00Z'::timestamptz,
    'desayuno'
  )->>'rotationSeed',
  null,
  'El snapshot lleva semilla de rotación'
);
```

Ajustar los ids del hogar y del usuario a los que use realmente ese bloque de fixtures.
Subir el plan de `51` a `56`.

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: fallan los cinco asertos nuevos (`rotationSeed` es null, el conteo de
candidatas da 41 en vez de 61, y el snapshot incluye las recetas de cena).

- [ ] **Paso 3: Implementar en 0074**

Copiar `build_household_recommendation_snapshot` completa desde 0065 al final de
`0074_recommendation_rotation_seed.sql` y aplicar **dos** cambios:

1. En el `jsonb_build_object` que arma el snapshot, junto a la clave `'mealType'`,
   añadir:

```sql
    'rotationSeed', md5(p_household_id::text || (p_evaluated_at at time zone 'Europe/Madrid')::date::text),
```

2. En la subconsulta de `'recipeInputs'`, sustituir:

```sql
      from public.recipes r
      left join public.recipe_season_profiles sp on sp.recipe_id = r.id
      where r.reusable
```

por:

```sql
      from public.recipes r
      left join public.recipe_season_profiles sp on sp.recipe_id = r.id
      -- La franja se filtra aquí y no después del corte de candidatas: con 451 recetas de
      -- almuerzo y 53 de desayuno, filtrar al final dejaba el desayuno sin candidatas y
      -- obligaba a caer en el fallback sin franja. Las recetas sin franja valen para todas.
      where r.reusable
        and (
          p_meal_type is null
          or r.meal_types is null
          or cardinality(r.meal_types) = 0
          or r.meal_types @> array[p_meal_type]
        )
```

Mantener el `revoke execute ... from public, anon, authenticated;` que acompaña a la
función.

Copiar después `evaluate_recommendation_snapshot` completa desde `0065:201` y aplicar
**tres** cambios:

1. En el bloque `declare`, subir el tope y guardar la semilla:

```sql
  -- El límite público cuenta alternativas; siempre se conserva una principal.
  v_limit integer := greatest(least(coalesce(p_alternative_limit, 5), 200), 0) + 1;
  v_rotation_seed text := coalesce(p_snapshot->>'rotationSeed', '');
```

2. En el `order by` final del `jsonb_agg` (`0065:494-504`), sustituir el último criterio
   `value->>'recipeId'` por:

```sql
    public.rotation_fraction(v_rotation_seed, value->>'recipeId')
```

3. En el `jsonb_build_object` de la respuesta, junto a `'mealType'`, añadir:

```sql
    'rotationSeed', v_rotation_seed,
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
pnpm test:db
```
Esperado: 56/56. Si algún aserto antiguo de 0008 se rompe por el nuevo orden de
desempate, revisar si asertaba una posición concreta entre candidatas empatadas: en ese
caso el aserto asumía el orden alfabético por id y hay que reescribirlo contra
`rotation_fraction`, no relajarlo.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0074_recommendation_rotation_seed.sql supabase/tests/0008_recommendation_decision.test.sql
git commit -m "feat: rotar el corte de candidatas y filtrar la franja antes de recortar"
```

---

### Tarea 3: Ventana, rotación diaria y penalización de lo cocinado en la Home

**Archivos:**
- Crear: `supabase/migrations/0075_today_variety_window.sql`
- Modificar: `supabase/tests/0009_household_today_decision.test.sql`

La definición vigente a copiar es
`supabase/migrations/0072_today_priority_ingredient_id.sql:6-177` completa, `revoke` y
`grant` incluidos.

- [ ] **Paso 1: Escribir los tests que fallan**

Añadir en `supabase/tests/0009_household_today_decision.test.sql`, junto al resto de
asertos sobre `pantry`:

```sql
select is(
  public.household_today_decision('cena', 5)->'pantry'->'featured'->>'recipeId',
  public.household_today_decision('cena', 5)->'pantry'->'featured'->>'recipeId',
  'Dos llamadas seguidas dan la misma destacada: la Home no se rebaraja al refrescar'
);

select is(
  (public.household_today_decision('cena', 5)->'pantry'->'alternatives')::text,
  (public.household_today_decision('cena', 5)->'pantry'->'alternatives')::text,
  'Las alternativas también son estables dentro del día'
);
```

Y, después de las fixtures de recetas, marcar como cocinada una de las candidatas con
pocos faltantes y comprobar que se va al final. Insertar antes de los asertos:

```sql
insert into public.cooked_recipes (user_id, household_id, recipe_id, title, servings, cooked_at)
values (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000900',
  '00000000-0000-0000-0000-000000009302',
  'Receta cocinada ayer', 2, now() - interval '1 day'
);

select ok(
  (public.household_today_decision('cena', 5)->'pantry'->'alternatives'->-1->>'recipeId')
    = '00000000-0000-0000-0000-000000009302'
  or not exists (
    select 1 from jsonb_array_elements(public.household_today_decision('cena', 5)->'pantry'->'alternatives') a
    where a->>'recipeId' = '00000000-0000-0000-0000-000000009302'
  ),
  'Lo cocinado ayer queda al final de las alternativas o fuera de ellas'
);
```

Ajustar los uuid de usuario, hogar y receta a los que use realmente el archivo (los del
bloque de fixtures que empieza sobre la línea 270). La receta elegida debe ser una que
hoy salga entre las alternativas; si no hay ninguna clara, insertar una receta nueva
cocinable con los mismos faltantes que otra no cocinada.

Subir `select plan(28);` a `select plan(31);`.

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: los asertos de estabilidad fallan de forma intermitente (el `random()` actual
puede coincidir por azar; con 5 candidatas falla la mayoría de las veces) y el de
cocinado falla en cuanto la receta cae en una posición que no es la última.

- [ ] **Paso 3: Implementar 0075**

Crear `supabase/migrations/0075_today_variety_window.sql` copiando la función de 0072
entera y aplicando estos cambios:

1. Cabecera del archivo:

```sql
-- household_today_decision v8: la ventana de candidatas pasa de 31 a 121 (el catálogo tiene
-- ~495 recetas reusables) y el random() de 0062 se sustituye por la semilla del snapshot, que
-- es la misma durante todo el día para un hogar. Además, lo cocinado en los últimos 14 días
-- baja al final: penaliza, no excluye, para que la Home no se quede corta.
```

2. En el `declare`, añadir:

```sql
  v_seed text;
  v_household_id uuid := public.current_household_id();
```

3. Sustituir la llamada de `0072:27`:

```sql
  v_decision := public.household_recommendation_decision(p_meal_type, 120);
  v_seed := coalesce(v_decision->>'rotationSeed', '');
```

4. En las **dos** consultas que arman `v_meal` (la de la franja, `0072:56-76`, y la del
   fallback, `0072:80-98`), sustituir el `order by missing, random()` por:

```sql
    order by cooked_recently, missing, public.rotation_fraction(v_seed, recipe_id)
```

y añadir en el `select` interior de ambas, junto a `missing` y `prio`:

```sql
      exists (
        select 1 from public.cooked_recipes cr
        where cr.household_id = v_household_id
          and cr.recipe_id = (candidate->>'recipeId')::uuid
          and cr.restored_at is null
          and cr.cooked_at > now() - interval '14 days'
      ) as cooked_recently,
```

5. En la elección de destacada (`0072:104-109`), sustituir `random()` por:

```sql
  order by (elem->>'missing')::int asc, (elem->>'prio')::numeric desc,
           public.rotation_fraction(v_seed, elem->>'recipeId')
```

6. En la sección `discover` (`0072:143-163`), sustituir las **dos** apariciones de la
   expresión de peso por la versión con semilla:

```sql
        (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0)
          + 0.5 * public.rotation_fraction(v_seed, candidate->>'recipeId')) as weight
```

y el `order by` interior del `distinct on`:

```sql
      order by r.tags[1],
        (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0)
          + 0.5 * public.rotation_fraction(v_seed, candidate->>'recipeId')) desc
```

7. Mantener `volatile` (lee `now()` y `cooked_recipes`), el `revoke` y el `grant` a
   `authenticated`.

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
pnpm test:db
```
Esperado: 31/31 en 0009 y sin regresiones en el resto de archivos.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0075_today_variety_window.sql supabase/tests/0009_household_today_decision.test.sql
git commit -m "feat: ampliar la ventana de la Home y rotar por semilla diaria"
```

---

### Tarea 4: Verificación contra producción y PR

**Archivos:** ninguno nuevo.

- [ ] **Paso 1: Comprobar la suite completa y el tipado**

```bash
pnpm test:db && pnpm typecheck && pnpm lint
```
Esperado: todo en verde.

- [ ] **Paso 2: Abrir la PR**

La rama debe ser `feat/variedad-recomendaciones`, creada desde `main` actualizada. Si el
trabajo se hizo en `main`, moverlo a la rama antes de nada: nunca se commitea a `main`.

```bash
git push -u origin feat/variedad-recomendaciones
gh pr create --base main --title "feat: variedad real en las recomendaciones de la Home" --body "..."
```

En el cuerpo de la PR explicar las tres causas de la repetición (ventana de 31, corte
determinista, franja filtrada tarde) y qué cambia cada migración.

- [ ] **Paso 3: Revisión**

Lanzar el agente revisor sobre el diff (`Task` → `feature-dev:code-reviewer` o el skill
`/code-review`). Corregir en la misma rama y volver a revisar si hay hallazgos.

Puntos que el revisor debe mirar con lupa:
- Que las copias de las funciones desde 0065 y 0072 no hayan perdido nada por el camino
  (comparar el cuerpo copiado con el original, no leerlo por encima).
- Que `evaluate_recommendation_snapshot` siga siendo `immutable` y no llame a `now()`,
  `random()` ni `current_date`.
- Que `revoke`/`grant` de las tres funciones queden igual que antes.
- Que el chat (`household_recipe_ranking` con `p_meal_type` nulo) no cambie de
  comportamiento por el filtro de franja del constructor.

- [ ] **Paso 4: Mergear (pedir confirmación) y desplegar**

Tras el visto bueno del usuario:

```bash
gh pr merge --squash --delete-branch
git switch main && git pull
supabase db push
```

- [ ] **Paso 5: Comprobar en la nube**

Con `PGPASSWORD` leído de `supabase/functions/.env` (clave `SUPABASE_PASSWORD`, nunca
imprimir el valor) contra
`postgresql://postgres.gnxqmlihdipgtkvaitvq@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`:

```sql
select public.rotation_fraction('a', 'b');
select proname, provolatile from pg_proc
where proname in ('evaluate_recommendation_snapshot', 'household_today_decision', 'rotation_fraction');
```
Esperado: la fracción entre 0 y 1; `evaluate_recommendation_snapshot` sigue en `i`
(immutable), `household_today_decision` en `v`, `rotation_fraction` en `i`.

---

## Cómo se sabe que ha funcionado

En el móvil, con la despensa sin tocar: las recetas de hoy y las de mañana deben
diferir en su mayoría, y refrescar la Home varias veces el mismo día debe devolver
siempre lo mismo. A primera hora de la mañana, las tarjetas deben ser de desayuno y no
platos de comida.

Lo que **no** arregla esta fase: que falten recetas para 217 ingredientes, que haya 52
títulos duplicados y que el tipo de cocina de la sección "Descubre" salga de un
`tags[1]` sin vocabulario controlado. Eso es la fase B de la spec.
