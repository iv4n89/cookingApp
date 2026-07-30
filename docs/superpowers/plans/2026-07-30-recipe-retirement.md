# Retirar recetas del catálogo — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar tarea a tarea. Los pasos
> usan casillas (`- [ ]`).

**Objetivo:** poder sacar una receta del catálogo sin borrarla, y usarlo para cerrar los 61
duplicados sobrantes.

**Arquitectura:** dos columnas en `recipes` (`retired_at`, `retired_reason`), el filtro
`retired_at is null` en las cuatro funciones y la vista que eligen recetas del catálogo, el
mismo filtro en el recetario del móvil, y una función `retire_duplicate_recipes()` que la
migración invoca para la limpieza.

**Stack:** PostgreSQL sobre Supabase, migraciones en `supabase/migrations/`, pruebas pgTAP
en `supabase/tests/` (`pnpm test:db`, requiere `supabase start` local), cliente Expo en
`apps/mobile`.

**Spec:** `docs/superpowers/specs/2026-07-30-recipe-retirement-design.md`.

---

## Contexto que hace falta para no equivocarse

- **Las funciones se rehacen con `create or replace` copiando la definición vigente
  completa.** No reescribir el cuerpo a mano ni "mejorarlo": copiar y tocar solo la línea
  indicada. Es el mismo procedimiento que usaron 0074 y 0075 al copiar de 0065 y 0072.
- **Definiciones vigentes y línea exacta a tocar:**

  | Función | Archivo | Línea del filtro |
  | --- | --- | --- |
  | `build_household_recommendation_snapshot` | `0074_recommendation_rotation_seed.sql` | `:204` (`where r.reusable`) |
  | `match_recipes` | `0016_personalized_recipes.sql` | `:41` (`and r.reusable`) |
  | `household_taste_recommendations` | `0066_household_taste_recommendations.sql` | `:72` (`where r.reusable`) |
  | `discover_recipes_by_ingredients` | `0068_discover_recipes_by_ingredients.sql` | `:114` (`where r.reusable`) |

- **`0016_personalized_recipes.sql` define dos funciones**: `match_recipes` (línea 8) y
  `recommended_recipes` (línea 53). Solo se copia y modifica `match_recipes`.
  `recommended_recipes` está muerta y no se toca.
- **`household_recipe_ranking` (`0064`) no se toca**: reutiliza
  `build_household_recommendation_snapshot`, así que hereda el filtro.
- **`find_similar_recipe` (`0034`) no se toca a propósito**: el dedup de la generación tiene
  que seguir viendo las retiradas.
- **Los tests corren en `begin`/`rollback`** y crean sus propias fixtures, porque los ids
  del catálogo sembrado cambian en cada `db reset`. Para el usuario y el hogar, el patrón es
  el de `0012_taste_personalization.test.sql:15-32`: insertar en `auth.users` (el trigger
  `handle_new_user` crea el hogar), guardar el hogar con `set_config`, insertar
  `user_preferences`, y al final `set_config('request.jwt.claim.sub', ...)` para que las RPC
  con `auth.uid()` funcionen.
- **`recipes.embedding` es `vector(768)`** (`0004_recipe_search.sql:6`). El patrón para
  fabricar vectores deterministas en las fixtures es
  `('[1,' || repeat('0,', 766) || '0]')::vector`
  (`0012_taste_personalization.test.sql:44`).

## Estructura de archivos

- Crear: `supabase/migrations/0077_recipe_retirement.sql` — columnas, checks, las cuatro
  funciones, la vista de cobertura y `retire_duplicate_recipes()`.
- Crear: `supabase/migrations/0078_retire_duplicate_recipes.sql` — la invocación de la
  limpieza sobre los datos existentes.
- Crear: `supabase/tests/0015_recipe_retirement.test.sql` — 19 asertos.
- Modificar: `apps/mobile/src/lib/recipes.ts:116` — filtro en el catálogo del recetario.

Esquema y datos van en migraciones separadas, como `0070` (cobertura de caducidad) y `0071`
(altas de ingredientes).

---

### Tarea 1: Columnas de retirada y sus restricciones

**Archivos:**
- Crear: `supabase/tests/0015_recipe_retirement.test.sql`
- Crear: `supabase/migrations/0077_recipe_retirement.sql`

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `supabase/tests/0015_recipe_retirement.test.sql`:

```sql
begin;

select plan(5);

select has_column('public', 'recipes', 'retired_at', 'recipes tiene retired_at');
select has_column('public', 'recipes', 'retired_reason', 'recipes tiene retired_reason');

insert into public.recipes (id, title, source, reusable, image_status)
values ('facade00-0000-4000-8000-000000000001', 'Retirada base', 'generated', true, 'none');

select throws_ok(
  $$update public.recipes set retired_at = now()
    where id = 'facade00-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'No se puede retirar sin decir por qué'
);

select throws_ok(
  $$update public.recipes set retired_reason = 'duplicate'
    where id = 'facade00-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'Un motivo sin fecha de retirada tampoco vale'
);

select throws_ok(
  $$update public.recipes set retired_at = now(), retired_reason = 'porque no me gusta'
    where id = 'facade00-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'El motivo sale de un vocabulario cerrado'
);

select * from finish();
rollback;
```

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: `0015` falla en `has_column`, porque las columnas no existen.

- [ ] **Paso 3: Implementación mínima**

Crear `supabase/migrations/0077_recipe_retirement.sql`:

```sql
-- Retirar una receta del catálogo sin borrarla. Borrar no era opción: user_recipes y
-- cooked_recipes tienen clave ajena contra recipes, así que borrar le quita a alguien una receta
-- que había guardado o cocinado. Por eso los 50 títulos duplicados llevaban semanas aplazados.
-- Retirada = retired_at no nulo. Sin columna de estado aparte: sería redundante y permitiría el
-- estado incoherente "publicada con fecha de retirada".

alter table public.recipes
  add column retired_at timestamptz,
  add column retired_reason text;

alter table public.recipes
  add constraint recipes_retired_reason_vocabulary
    check (retired_reason in ('duplicate', 'incoherent', 'bad_image')),
  -- Retirar sin decir por qué no vale: en un mes nadie recordará por qué se fueron 61 recetas.
  add constraint recipes_retired_coherent
    check ((retired_at is null) = (retired_reason is null));

-- Las consultas del catálogo filtran por esto en cada llamada.
create index recipes_published_idx on public.recipes (id) where retired_at is null;
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
npx supabase migration up --local && pnpm test:db
```
Esperado: `0015` en 5/5 y ningún otro archivo roto.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0077_recipe_retirement.sql supabase/tests/0015_recipe_retirement.test.sql
git commit -m "feat: columnas para retirar una receta del catálogo"
```

---

### Tarea 2: El filtro en las cuatro funciones del catálogo

**Archivos:**
- Modificar: `supabase/migrations/0077_recipe_retirement.sql`
- Modificar: `supabase/tests/0015_recipe_retirement.test.sql`

- [ ] **Paso 1: Escribir los tests que fallan**

Subir `select plan(5);` a `select plan(12);` y añadir antes de `select * from finish();`:

```sql
-- Usuario y hogar: el trigger handle_new_user crea el hogar al insertar en auth.users.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'facade00-0000-4000-8000-000000000901',
  'authenticated', 'authenticated', 'retirada@example.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values ('facade00-0000-4000-8000-000000000901', '{}', '{}', '');

select set_config(
  'test.retirement_household',
  (select household_id::text from public.household_members
   where user_id = 'facade00-0000-4000-8000-000000000901'),
  true
);

-- Un ingrediente propio y dos recetas que lo usan: una publicada y otra retirada. Mismo
-- embedding para las dos, así que cualquier diferencia entre ellas viene del filtro.
insert into public.ingredients (id, name, normalized_name, category, canonical_id)
values ('facade00-0000-4000-8000-000000000010', 'Retirada ingrediente', 'retirada ingrediente', 'otros', null);

insert into public.recipes (id, title, source, reusable, image_status, embedding, ingredients)
values
  (
    'facade00-0000-4000-8000-000000000101', 'Retirada publicada', 'generated', true, 'none',
    ('[1,' || repeat('0,', 766) || '0]')::vector,
    '[{"name":"Retirada ingrediente","unit":"g","quantity":100,"ingredient_id":"facade00-0000-4000-8000-000000000010","substitutions":[]}]'::jsonb
  ),
  (
    'facade00-0000-4000-8000-000000000102', 'Retirada retirada', 'generated', true, 'none',
    ('[1,' || repeat('0,', 766) || '0]')::vector,
    '[{"name":"Retirada ingrediente","unit":"g","quantity":100,"ingredient_id":"facade00-0000-4000-8000-000000000010","substitutions":[]}]'::jsonb
  );

update public.recipes
set retired_at = now(), retired_reason = 'incoherent'
where id = 'facade00-0000-4000-8000-000000000102';

select is(
  (select count(*) from jsonb_array_elements(
    public.build_household_recommendation_snapshot(
      current_setting('test.retirement_household')::uuid,
      'facade00-0000-4000-8000-000000000901',
      now(),
      null
    )->'recipeInputs') ri
   where ri->>'recipeId' = 'facade00-0000-4000-8000-000000000102'),
  0::bigint,
  'Una receta retirada no entra en el snapshot del motor'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.build_household_recommendation_snapshot(
      current_setting('test.retirement_household')::uuid,
      'facade00-0000-4000-8000-000000000901',
      now(),
      null
    )->'recipeInputs') ri
   where ri->>'recipeId' = 'facade00-0000-4000-8000-000000000101'),
  1::bigint,
  'La publicada sí entra: el filtro no se lleva por delante el catálogo'
);

select set_config('request.jwt.claim.sub', 'facade00-0000-4000-8000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.discover_recipes_by_ingredients(
    array['facade00-0000-4000-8000-000000000010']::uuid[], 50, 0
  ) d where d.id = 'facade00-0000-4000-8000-000000000102'),
  0::bigint,
  'El descubridor no ofrece recetas retiradas'
);

-- Para el carrusel hace falta una semilla favorita: la publicada hace de semilla y la
-- retirada tiene el mismo embedding, así que sin filtro saldría con afinidad máxima.
insert into public.user_recipes (user_id, recipe_id, is_favorite)
values ('facade00-0000-4000-8000-000000000901', 'facade00-0000-4000-8000-000000000101', true);

select is(
  (select count(*) from public.household_taste_recommendations(1000) t
   where t.id = 'facade00-0000-4000-8000-000000000102'),
  0::bigint,
  'El carrusel Para ti no ofrece recetas retiradas'
);

select is(
  (select count(*) from public.match_recipes(
    ('[1,' || repeat('0,', 766) || '0]')::vector, 0.1, 1000
  ) m where m.id = 'facade00-0000-4000-8000-000000000102'),
  0::bigint,
  'La búsqueda semántica del chat no devuelve recetas retiradas'
);

select ok(
  exists (
    select 1 from public.find_similar_recipe(
      ('[1,' || repeat('0,', 766) || '0]')::vector, 0.1
    ) f where f.id = 'facade00-0000-4000-8000-000000000102'
  ),
  'El dedup de la generación SÍ ve las retiradas: si no, volvería a generar el duplicado'
);

-- Lo que sostiene las guardadas: quien tenía la receta la sigue pudiendo abrir por id. Se
-- comprueba con el rol authenticated de verdad, porque los tests corren como postgres y
-- postgres se salta la RLS. El patrón es el de 0001_rls_contracts.test.sql:77.
set local role authenticated;

select is(
  (select count(*) from public.recipes where id = 'facade00-0000-4000-8000-000000000102'),
  1::bigint,
  'Una receta retirada sigue siendo legible por id: quien la tenía guardada no la pierde'
);

reset role;
```

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: fallan los cuatro asertos de exclusión (la retirada sigue apareciendo en motor,
descubridor, carrusel y `match_recipes`). El de `find_similar_recipe` y el de la publicada
pasan ya, porque describen el comportamiento actual que hay que conservar.

- [ ] **Paso 3: Implementar en 0077**

Para cada una de las cuatro funciones: copiar su definición vigente completa al final de
`0077_recipe_retirement.sql` —incluyendo el `revoke`/`grant` que la acompaña— y añadir el
filtro justo después de la línea del `reusable`.

En `build_household_recommendation_snapshot` (copiar desde
`0074_recommendation_rotation_seed.sql`, desde
`create or replace function public.build_household_recommendation_snapshot` hasta el
`revoke` que la sigue, incluido), la línea 204 dice:

```sql
      where r.reusable
```

y pasa a decir:

```sql
      where r.reusable
        -- Una receta retirada no vuelve a la Home ni al chat, pero sigue accesible por id
        -- para quien la tenía guardada.
        and r.retired_at is null
```

El mismo cambio, con el mismo comentario solo en la primera aparición, en:

- `match_recipes`, copiada de `0016_personalized_recipes.sql:8` hasta el final de su cuerpo
  (NO copiar `recommended_recipes`, que empieza en la línea 53). Su línea 41 dice
  `and r.reusable`; queda `and r.reusable and r.retired_at is null`.
- `household_taste_recommendations`, copiada de
  `0066_household_taste_recommendations.sql` completa. Línea 72.
- `discover_recipes_by_ingredients`, copiada de
  `0068_discover_recipes_by_ingredients.sql` completa. Línea 114.

Cuidado con dos cosas al copiar:

1. `create or replace function` no permite cambiar el tipo de retorno. No se toca ninguna
   firma ni ningún `returns table`, así que basta con no editarlos.
2. `match_recipes` y `find_similar_recipe` viven sin `public.` en el original
   (`create function match_recipes(...)`). Mantener exactamente el mismo nombre y esquema
   que tenían, o se creará una función nueva en vez de reemplazar la vigente.

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
npx supabase migration up --local && pnpm test:db
```
Esperado: `0015` en 12/12 y ningún otro archivo roto. Si se rompe `0008`, `0009`, `0011`,
`0012` o `0013`, es señal de que la copia perdió algo: comparar el cuerpo copiado con el
original línea a línea, no leerlo por encima.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0077_recipe_retirement.sql supabase/tests/0015_recipe_retirement.test.sql
git commit -m "feat: excluir las recetas retiradas del catálogo y las recomendaciones"
```

---

### Tarea 3: La cobertura deja de contar las retiradas

**Archivos:**
- Modificar: `supabase/migrations/0077_recipe_retirement.sql`
- Modificar: `supabase/tests/0015_recipe_retirement.test.sql`

- [ ] **Paso 1: Escribir el test que falla**

Subir `select plan(12);` a `select plan(13);` y añadir:

```sql
-- Las dos recetas de las fixtures usan el mismo ingrediente y una está retirada: la cobertura
-- tiene que ver una, no dos. Si contara las retiradas, retirar los 61 duplicados dejaría la
-- métrica de la fase B midiendo recetas que ya no existen para el usuario.
select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'facade00-0000-4000-8000-000000000010'),
  1::bigint,
  'La cobertura por ingrediente no cuenta las recetas retiradas'
);
```

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: da 2 en vez de 1.

- [ ] **Paso 3: Implementar en 0077**

Añadir al final de `0077_recipe_retirement.sql` la vista rehecha. Es la misma de
`0076_ingredient_recipe_coverage.sql` con una línea más en el `where` de la CTE:

```sql
-- La cobertura cuenta solo recetas publicadas: retirar un duplicado no añade cobertura, y si la
-- vista siguiera contándolo mediríamos el avance de la fase B con una regla falsa.
create or replace view public.ingredient_recipe_coverage
with (security_invoker = true) as
with recipe_canonical_ingredients as (
  -- distinct: una receta que menciona dos variantes del mismo canónico cuenta una vez, no dos.
  -- El join descarta las filas sin ingredient_id, que no se pueden atribuir a ningún canónico.
  select distinct
    r.id as recipe_id,
    r.reusable,
    coalesce(i.canonical_id, i.id) as canonical_ingredient_id
  from public.recipes r
  cross join lateral jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) as ing(value)
  join public.ingredients i on i.id = (ing.value->>'ingredient_id')::uuid
  where r.retired_at is null
)
select
  canonical.id as ingredient_id,
  canonical.name,
  canonical.category,
  count(usage.recipe_id) as recipe_count,
  count(usage.recipe_id) filter (where usage.reusable) as reusable_recipe_count
from public.ingredients canonical
-- left join: los ingredientes sin ninguna receta son justamente la lista de trabajo.
left join recipe_canonical_ingredients usage
  on usage.canonical_ingredient_id = canonical.id
where canonical.canonical_id is null
group by canonical.id, canonical.name, canonical.category;
```

`create or replace view` conserva los permisos, así que no hay que repetir el `revoke` ni el
`grant` de 0076.

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
npx supabase migration up --local && pnpm test:db
```
Esperado: `0015` en 13/13, y `0014` sigue en verde (sus fixtures no tienen retiradas).

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0077_recipe_retirement.sql supabase/tests/0015_recipe_retirement.test.sql
git commit -m "feat: la cobertura por ingrediente cuenta solo recetas publicadas"
```

---

### Tarea 4: La limpieza de duplicados

**Archivos:**
- Modificar: `supabase/migrations/0077_recipe_retirement.sql`
- Crear: `supabase/migrations/0078_retire_duplicate_recipes.sql`
- Modificar: `supabase/tests/0015_recipe_retirement.test.sql`

- [ ] **Paso 1: Escribir los tests que fallan**

Subir `select plan(13);` a `select plan(19);` y añadir:

```sql
select has_function(
  'public', 'retire_duplicate_recipes', array[]::text[],
  'Existe la función de limpieza de duplicados'
);

-- Tres copias del mismo título: DUP_B la tiene guardada el usuario, DUP_C tiene imagen lista,
-- DUP_A es la más antigua y no tiene nada. Debe quedarse DUP_B.
insert into public.recipes (id, title, source, reusable, image_status, created_at) values
  ('facade00-0000-4000-8000-000000000201', 'Título repetido', 'generated', true, 'none', now() - interval '3 days'),
  ('facade00-0000-4000-8000-000000000202', 'Título repetido', 'generated', true, 'none', now() - interval '2 days'),
  ('facade00-0000-4000-8000-000000000203', 'Título repetido', 'generated', true, 'ready', now() - interval '1 day');

insert into public.user_recipes (user_id, recipe_id, is_favorite)
values ('facade00-0000-4000-8000-000000000901', 'facade00-0000-4000-8000-000000000202', true);

-- Dos recetas no reusables con el mismo título: son de usuarios distintos y no sobra ninguna.
insert into public.recipes (id, title, source, reusable, image_status) values
  ('facade00-0000-4000-8000-000000000301', 'Tortilla de alguien', 'generated', false, 'none'),
  ('facade00-0000-4000-8000-000000000302', 'Tortilla de alguien', 'generated', false, 'none');

select lives_ok(
  $$select public.retire_duplicate_recipes()$$,
  'La limpieza se ejecuta sin errores'
);

select is(
  (select id from public.recipes
   where title = 'Título repetido' and retired_at is null),
  'facade00-0000-4000-8000-000000000202'::uuid,
  'Entre tres copias se queda la que alguien tiene guardada'
);

select is(
  (select count(*) from public.recipes
   where title = 'Título repetido' and retired_reason = 'duplicate'),
  2::bigint,
  'Las otras dos quedan retiradas con motivo duplicate'
);

select is(
  (select count(*) from public.recipes
   where title = 'Tortilla de alguien' and retired_at is null),
  2::bigint,
  'La limpieza no toca las recetas no reusables: cada usuario tiene la suya'
);

select is(
  public.retire_duplicate_recipes(),
  0,
  'Volver a ejecutarla no retira nada más'
);
```

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```
Esperado: falla en `has_function`, porque la función no existe.

- [ ] **Paso 3: Implementar la función en 0077**

Añadir al final de `0077_recipe_retirement.sql`:

```sql
-- Retira las copias sobrantes de cada título repetido y devuelve cuántas retiró. Va como función
-- y no como update dentro de la migración por dos razones: un update de una sola ejecución no se
-- puede probar (la base local no tiene ni una receta), y el slice siguiente genera cientos de
-- recetas que traerán duplicados nuevos.
--
-- El título se compara tal cual, sin normalizar: es como se midieron los 50 títulos repetidos, y
-- normalizar agruparía platos que solo coinciden al quitarles los acentos.
create function public.retire_duplicate_recipes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retired integer;
begin
  with candidates as (
    select
      r.id,
      r.title,
      r.image_status,
      r.created_at,
      -- Si alguien la tiene guardada o valorada, es la que se queda: retirar la suya la dejaría
      -- fuera del catálogo sin que él haya hecho nada.
      exists (select 1 from public.user_recipes ur where ur.recipe_id = r.id) as saved
    from public.recipes r
    where r.reusable
      and r.retired_at is null
  ),
  ranked as (
    select
      id,
      row_number() over (
        partition by title
        order by saved desc, (image_status = 'ready') desc, created_at, id
      ) as position
    from candidates
  )
  update public.recipes r
  set retired_at = now(), retired_reason = 'duplicate'
  from ranked
  where r.id = ranked.id
    and ranked.position > 1;

  get diagnostics v_retired = row_count;
  return v_retired;
end;
$$;

revoke execute on function public.retire_duplicate_recipes() from public, anon, authenticated;
```

`security definer` porque escribe en `recipes`, que tiene RLS y no admite DML del cliente.
El `revoke` deja la ejecución solo a `service_role`, que es quien aplica migraciones.

- [ ] **Paso 4: Ejecutar y ver que pasa**

```bash
npx supabase migration up --local && pnpm test:db
```
Esperado: `0015` en 19/19.

- [ ] **Paso 5: Crear la migración de datos**

Crear `supabase/migrations/0078_retire_duplicate_recipes.sql`:

```sql
-- Cierra los duplicados que arrastra el catálogo: el 30 de julio había 50 títulos repetidos entre
-- las 504 recetas, 111 recetas implicadas y 61 sobrantes. Estaban aplazados desde el 25 de julio
-- por no tener dónde marcarlos. Esquema en 0077; aquí solo se aplica a los datos.
select public.retire_duplicate_recipes();
```

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/0077_recipe_retirement.sql supabase/migrations/0078_retire_duplicate_recipes.sql supabase/tests/0015_recipe_retirement.test.sql
git commit -m "feat: retirar las copias sobrantes de cada título repetido"
```

---

### Tarea 5: El recetario del móvil

**Archivos:**
- Modificar: `apps/mobile/src/lib/recipes.ts:116`

- [ ] **Paso 1: Leer el contexto**

```bash
sed -n '105,125p' apps/mobile/src/lib/recipes.ts
```

La consulta del catálogo filtra `.eq('reusable', true)`. La lectura por id (línea 154) no se
toca: es la que sostiene las recetas guardadas de quien las tenía.

- [ ] **Paso 2: Añadir el filtro**

En la consulta del catálogo, justo después de `.eq('reusable', true)`, añadir:

```ts
    .is('retired_at', null)
```

- [ ] **Paso 3: Verificar el tipado**

```bash
pnpm typecheck && pnpm lint
```
Esperado: en verde. Si `typecheck` se queja de que `retired_at` no existe en los tipos
generados de Supabase, es que el proyecto tiene tipos generados que hay que regenerar:
comprobar si `apps/mobile/src` importa un `Database` generado antes de tocar nada.

- [ ] **Paso 4: Commit**

```bash
git add apps/mobile/src/lib/recipes.ts
git commit -m "feat: el recetario no lista las recetas retiradas"
```

---

### Tarea 6: Verificación, PR y despliegue

**Archivos:** ninguno nuevo.

- [ ] **Paso 1: Suite completa**

```bash
pnpm test:db && pnpm typecheck && pnpm lint
```
Esperado: 274 pruebas pgTAP (255 + 19) y el resto en verde.

- [ ] **Paso 2: Comprobar que la migración es aplicable desde cero**

```bash
npx supabase db reset && pnpm test:db
```
Esperado: las 79 migraciones se aplican en orden sobre una base vacía y la suite pasa. Es la
validación operativa que el proyecto tiene pendiente desde la fase 1 y que aquí importa,
porque 0077 rehace cuatro funciones grandes copiadas a mano.

- [ ] **Paso 3: PR**

```bash
git push -u origin feat/estado-publicacion
gh pr create --base main --title "feat: retirar recetas del catálogo sin borrarlas" --body "Segundo slice de la fase B.

Añade \`retired_at\` y \`retired_reason\` a \`recipes\`, con vocabulario cerrado (\`duplicate\`, \`incoherent\`, \`bad_image\`) y un check que impide retirar sin motivo. Retirada es \`retired_at is not null\`: sin columna de estado aparte, que sería redundante y admitiría el estado incoherente.

El filtro \`retired_at is null\` entra en las cuatro funciones y la vista que eligen recetas del catálogo: el motor de recomendación (que cubre Home, today y el ranking del chat, porque 0064 lo reutiliza), \`match_recipes\`, el carrusel por gustos, el descubridor y la cobertura por ingrediente. En el móvil, el catálogo del recetario.

Lo que **no** se filtra, a propósito: \`find_similar_recipe\`, para que el generador no vuelva a crear la receta que acabamos de retirar; y la lectura por id, para que quien tenía la receta guardada la conserve.

La limpieza de los duplicados va como función \`retire_duplicate_recipes()\` (invocada por 0078) y no como update suelto, porque así se prueba y porque el slice siguiente generará duplicados nuevos. Criterio de la que se queda: la que alguien tenga guardada, luego la que tenga imagen lista, luego la más antigua, luego el id menor. El 30 de julio eran 50 títulos y 61 sobrantes.

**Validación**: 274 pruebas pgTAP (19 nuevas), \`db reset\` desde cero, typecheck y lint.

Spec: \`docs/superpowers/specs/2026-07-30-recipe-retirement-design.md\`
Plan: \`docs/superpowers/plans/2026-07-30-recipe-retirement.md\`"
```

- [ ] **Paso 4: Revisión**

Agente revisor sobre el diff. Puntos a mirar con lupa:

- **Que las copias de las cuatro funciones no hayan perdido nada.** Es el riesgo principal de
  esta PR: comparar cada cuerpo copiado con su original, no leerlo por encima.
- Que `evaluate_recommendation_snapshot` siga siendo `immutable` (no se toca, pero
  `build_household_recommendation_snapshot` la invoca).
- Que los `revoke`/`grant` de las cuatro funciones queden exactamente como estaban.
- Que `find_similar_recipe` siga viendo las retiradas.
- Que el criterio de `retire_duplicate_recipes` sea determinista: sin `id` como último
  desempate, dos ejecuciones podrían quedarse con copias distintas.
- Que el filtro del móvil esté en la consulta del catálogo y no en la lectura por id.

- [ ] **Paso 5: Mergear (pedir confirmación) y desplegar**

```bash
gh pr merge --squash --delete-branch
git switch main && git pull
npx supabase db push
```

- [ ] **Paso 6: Comprobar en la nube**

Con `PGPASSWORD` leído de `supabase/functions/.env` (clave `SUPABASE_PASSWORD`, nunca
imprimir el valor) contra el pooler `aws-0-eu-central-1.pooler.supabase.com:5432`:

```sql
select count(*) as retiradas from public.recipes where retired_reason = 'duplicate';

select count(*) as titulos_duplicados_publicados
from (
  select title from public.recipes
  where reusable and retired_at is null
  group by title having count(*) > 1
) d;

select
  count(*) filter (where recipe_count = 0) as sin_ninguna,
  count(*) as canonicos
from public.ingredient_recipe_coverage;
```

Esperado: 61 retiradas, 0 títulos duplicados publicados, y la cobertura con 217 o algo más
de ingredientes sin ninguna receta —nunca menos—, porque retirar recetas solo puede quitar
cobertura. Si baja de 217, el filtro de la vista no está funcionando.

---

## Cómo se sabe que ha funcionado

En el móvil: el recetario deja de mostrar títulos repetidos. La Home, el chat y el
descubridor no ofrecen recetas retiradas. Una receta guardada antes de la limpieza sigue
abriéndose desde las guardadas.

Lo que **no** hace este slice: no arregla las recetas incoherentes ni las fotos que no
corresponden —solo permite retirarlas, una a una y a mano— y no genera nada nuevo. La
coherencia culinaria en el prompt y la generación dirigida son los slices siguientes.
