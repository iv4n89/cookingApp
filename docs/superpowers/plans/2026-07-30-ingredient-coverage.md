# Vista de cobertura por ingrediente canónico — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar tarea a tarea. Los pasos
> usan casillas (`- [ ]`).

**Objetivo:** una vista que diga, por ingrediente canónico, cuántas recetas lo usan, para
dirigir la generación de la fase B a los huecos y medir si se cierran.

**Arquitectura:** un solo objeto nuevo, la vista `public.ingredient_recipe_coverage` en la
migración 0076. Despliega el `jsonb` de `recipes.ingredients`, resuelve cada
`ingredient_id` a su canónico con `coalesce(canonical_id, id)` y agrega con un `left join`
desde `ingredients` para que los que no tienen ninguna receta salgan con cero. Sin RPC,
sin tabla nueva, sin cliente.

**Stack:** PostgreSQL sobre Supabase, migraciones en `supabase/migrations/`, pruebas pgTAP
en `supabase/tests/` (`pnpm test:db`, requiere `supabase start` local).

**Spec:** `docs/superpowers/specs/2026-07-30-ingredient-coverage-design.md`.

---

## Contexto que hace falta para no equivocarse

- **Los ingredientes de una receta no están en una tabla puente.** Viven en
  `recipes.ingredients`, un `jsonb` con una entrada por ingrediente y la clave
  `ingredient_id` (`0001_init.sql:15`). Se despliega con `jsonb_array_elements`.
- **El catálogo agrupa variantes bajo un canónico** con `canonical_id`, donde
  `canonical_id is null` significa "es su propio canónico"
  (`0027_ingredients_canonical.sql`). Todo el esquema cruza por
  `coalesce(canonical_id, id)`: el motor de recomendación
  (`0065_recommendation_taste_affinity.sql:151`) y el consumo FEFO
  (`0045_batch_consumption_helper.sql:26`). La vista hace lo mismo.
- **`recipes.reusable`** (`0016_personalized_recipes.sql`) marca si una receta sirve para
  cualquier hogar o se generó para un usuario concreto.
- **Sería la primera vista del esquema.** Hasta ahora solo hay tablas y funciones. No hay
  convención previa que copiar; sí hay que respetar la de permisos: `revoke` explícito a
  `anon` y `authenticated`, porque Supabase concede `select` por defecto a los objetos
  nuevos de `public`.
- **`image_status`** es `not null` con default `'pending'`
  (`0031_recipe_image_status.sql`). Las fixtures lo pasan explícito como `'none'`, igual
  que los tests existentes (`0013_recipe_discoverer.test.sql:52`), para que ninguna receta
  de prueba entre en la cola de generación de imágenes.

## Estructura de archivos

- Crear: `supabase/migrations/0076_ingredient_recipe_coverage.sql` — la vista y sus
  permisos.
- Crear: `supabase/tests/0014_ingredient_coverage.test.sql` — las pruebas pgTAP.

No se toca ningún archivo existente. La vista no la consume nadie todavía: el consumidor
llega en el slice de generación dirigida.

## Decisiones tomadas (no volver a abrirlas)

- Vista normal, no materializada.
- `select` solo para `service_role`.
- Sin histórico, sin señal de despensa, sin RPC.
- Las filas de ingrediente sin `ingredient_id` quedan fuera: son 19 de 3.790 y no se
  pueden atribuir a ningún canónico.

---

### Tarea 1: La vista y sus pruebas

**Archivos:**
- Crear: `supabase/tests/0014_ingredient_coverage.test.sql`
- Crear: `supabase/migrations/0076_ingredient_recipe_coverage.sql`

- [ ] **Paso 1: Escribir el test que falla**

Crear `supabase/tests/0014_ingredient_coverage.test.sql` con este contenido completo:

```sql
begin;

select plan(11);

select has_view('public', 'ingredient_recipe_coverage', 'Existe la vista de cobertura');

select ok(
  has_table_privilege('service_role', 'public.ingredient_recipe_coverage', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ingredient_recipe_coverage', 'SELECT')
  and not has_table_privilege('anon', 'public.ingredient_recipe_coverage', 'SELECT'),
  'Solo service_role puede leerla: no es dato de usuario y no la consume el móvil'
);

-- Ingredientes propios: los ids del catálogo sembrado cambian en cada `db reset`, así que el
-- test crea los suyos. CAN_* son canónicos; VAR_* cuelgan de uno.
insert into public.ingredients (id, name, normalized_name, category, canonical_id) values
  ('c0ffee00-0000-4000-8000-000000000001', 'Cobertura A', 'cobertura a', 'verduras', null),
  ('c0ffee00-0000-4000-8000-000000000002', 'Cobertura A variante', 'cobertura a variante', 'verduras',
   'c0ffee00-0000-4000-8000-000000000001'),
  ('c0ffee00-0000-4000-8000-000000000003', 'Cobertura B', 'cobertura b', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000004', 'Cobertura C', 'cobertura c', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000005', 'Cobertura D', 'cobertura d', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000006', 'Cobertura E', 'cobertura e', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000007', 'Cobertura E variante', 'cobertura e variante', 'otros',
   'c0ffee00-0000-4000-8000-000000000006');

-- R1: A + B. R2: B. R3: solo la variante de A. R4: D, no reusable. R5: una fila sin enlazar.
-- R6: E y su variante en la misma receta.
insert into public.recipes (id, title, source, reusable, image_status, ingredients) values
  (
    'c0ffee00-0000-4000-8000-000000009801', 'Cobertura R1', 'generated', true, 'none',
    '[
      {"name":"Cobertura A","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000001","substitutions":[]},
      {"name":"Cobertura B","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000003","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009802', 'Cobertura R2', 'generated', true, 'none',
    '[
      {"name":"Cobertura B","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000003","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009803', 'Cobertura R3', 'generated', true, 'none',
    '[
      {"name":"Cobertura A variante","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000002","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009804', 'Cobertura R4', 'generated', false, 'none',
    '[
      {"name":"Cobertura D","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000005","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009805', 'Cobertura R5', 'generated', true, 'none',
    '[
      {"name":"Ingrediente que el resolver no supo enlazar","unit":"g","quantity":100,"substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009806', 'Cobertura R6', 'generated', true, 'none',
    '[
      {"name":"Cobertura E","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000006","substitutions":[]},
      {"name":"Cobertura E variante","unit":"g","quantity":50,"ingredient_id":"c0ffee00-0000-4000-8000-000000000007","substitutions":[]}
    ]'::jsonb
  );

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000003'),
  2::bigint,
  'Un ingrediente que usan dos recetas cuenta dos'
);

select is(
  (select count(*) from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000002'),
  0::bigint,
  'Una variante no tiene fila propia: la cobertura es del canónico'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000001'),
  2::bigint,
  'La receta que solo usa la variante suma al canónico'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000006'),
  1::bigint,
  'Una receta que menciona dos variantes del mismo canónico cuenta una vez, no dos'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000004'),
  0::bigint,
  'Un ingrediente sin ninguna receta aparece con cero, no desaparece'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000005'),
  1::bigint,
  'Una receta no reusable suma en recipe_count'
);

select is(
  (select reusable_recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000005'),
  0::bigint,
  'Una receta no reusable no suma en reusable_recipe_count: no llegará a la Home de nadie'
);

select is(
  (select count(*) from public.ingredient_recipe_coverage),
  (select count(*) from public.ingredients where canonical_id is null),
  'Una fila por canónico: la receta con un ingrediente sin enlazar no añade ninguna'
);

select is(
  (select category from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000001'),
  'verduras',
  'La categoría del canónico sale en la vista, para atacar familias enteras de huecos'
);

select * from finish();
rollback;
```

- [ ] **Paso 2: Ejecutar y ver que falla**

```bash
pnpm test:db
```

Esperado: `0014` falla con `relation "public.ingredient_recipe_coverage" does not exist`.
Si la base local no está arrancada, `supabase start` primero.

- [ ] **Paso 3: Implementación mínima**

Crear `supabase/migrations/0076_ingredient_recipe_coverage.sql`:

```sql
-- Cobertura del catálogo por ingrediente canónico: cuántas recetas usan cada uno. Es a la vez la
-- lista de trabajo de la generación dirigida de la fase B (el 24 de julio había 217 canónicos sin
-- ninguna receta, y el brócoli no aparecía en ninguna de las 504) y la métrica para saber si el
-- hueco se cierra. Se cuenta por canónico, coalesce(canonical_id, id), porque así se cruzan
-- despensa y recetas en el resto del esquema; contar por variante daría una cobertura inventada.

create view public.ingredient_recipe_coverage
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

-- Supabase concede select por defecto a los objetos nuevos de public: hay que revocarlo.
revoke all on public.ingredient_recipe_coverage from anon, authenticated;
grant select on public.ingredient_recipe_coverage to service_role;
```

- [ ] **Paso 4: Aplicar la migración y ejecutar**

```bash
npx supabase migration up --local && pnpm test:db
```

Esperado: `0014_ingredient_coverage.test.sql .. ok` con 11/11 y ningún otro archivo roto.

Si falla el aserto de permisos, comprobar si el `revoke` necesita nombrar también a
`postgres`: en ese caso el `grant` por defecto vino de otra parte y hay que averiguar de
dónde antes de relajar el aserto.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0076_ingredient_recipe_coverage.sql supabase/tests/0014_ingredient_coverage.test.sql
git commit -m "feat: vista de cobertura de recetas por ingrediente canónico"
```

---

### Tarea 2: Contrastar con la línea base y desplegar

**Archivos:** ninguno nuevo.

- [ ] **Paso 1: Suite completa**

```bash
pnpm test:db && pnpm typecheck && pnpm lint
```

Esperado: todo en verde. `typecheck` y `lint` no deberían verse afectados —no se toca
TypeScript— pero se ejecutan para no dejar la rama en un estado sin verificar.

- [ ] **Paso 2: PR**

Rama `feat/cobertura-ingredientes` desde `main` actualizada.

```bash
git push -u origin feat/cobertura-ingredientes
gh pr create --base main --title "feat: vista de cobertura de recetas por ingrediente" --body "Primer slice de la fase B. Añade la vista \`ingredient_recipe_coverage\`: una fila por ingrediente canónico con cuántas recetas del catálogo lo usan y cuántas de esas son reusables.

Es la lista de trabajo de la generación dirigida (el 24 de julio había 217 canónicos sin ninguna receta y el brócoli no aparecía en ninguna de las 504) y la métrica para saber si el hueco se cierra.

- Cuenta por canónico, \`coalesce(canonical_id, id)\`, igual que el motor de recomendación y el consumo FEFO: contar por variante daría una cobertura inventada.
- \`reusable_recipe_count\` va aparte porque una receta no reusable se generó para un usuario concreto y no llegará a la Home de nadie más: sin esa columna un ingrediente puede parecer cubierto y seguir sin salir jamás.
- \`select\` solo para \`service_role\`. No la consume el móvil.

No genera ninguna receta: eso es el slice siguiente.

Spec: \`docs/superpowers/specs/2026-07-30-ingredient-coverage-design.md\`."
```

- [ ] **Paso 3: Revisión**

Agente revisor sobre el diff (`Task` → `feature-dev:code-reviewer` o `/code-review`).
Puntos a mirar con lupa:

- Que el `distinct` de la CTE cubra de verdad el caso de dos variantes en la misma receta,
  y que no esté colapsando dos recetas distintas.
- Que el `left join` no se convierta en `inner join` al añadir la condición de `reusable`
  (sería el error clásico: los ingredientes sin recetas desaparecerían).
- Que `authenticated` y `anon` no tengan `select` sobre la vista.
- Que `security_invoker = true` esté puesto: sin él la vista corre con los permisos del
  propietario y se salta la RLS del que consulta.

- [ ] **Paso 4: Mergear (pedir confirmación) y desplegar**

```bash
gh pr merge --squash --delete-branch
git switch main && git pull
npx supabase db push
```

- [ ] **Paso 5: Contrastar con la línea base**

Contra producción, con `PGPASSWORD` leído de `supabase/functions/.env` (clave
`SUPABASE_PASSWORD`, nunca imprimir el valor) y el pooler
`aws-0-eu-central-1.pooler.supabase.com:5432`:

```sql
select
  count(*) filter (where recipe_count = 0) as sin_ninguna,
  count(*) filter (where recipe_count = 1) as con_una,
  count(*) filter (where recipe_count = 2) as con_dos,
  count(*) filter (where recipe_count >= 3) as con_tres_o_mas,
  count(*) as canonicos
from public.ingredient_recipe_coverage;

select recipe_count from public.ingredient_recipe_coverage where name ilike '%brócoli%';
```

Esperado, según la medición del 24 de julio: 217 / 81 / 45 / 189, total 532 canónicos, y el
brócoli a cero.

**Si los números no cuadran, parar.** O la medición del 24 de julio contaba otra cosa (por
ejemplo, sin agrupar por canónico) o la vista está mal. Averiguar cuál de las dos antes de
generar una sola receta encima de esta métrica: todo el slice siguiente se dirige con estos
números.

- [ ] **Paso 6: Guardar la lista de trabajo**

```sql
select category, count(*) as huecos
from public.ingredient_recipe_coverage
where recipe_count < 3
group by category
order by huecos desc;
```

El resultado es la entrada del slice siguiente (generación dirigida): dice por qué familia
empezar. Pegarlo en la spec de ese slice cuando se escriba, no en este plan.

---

## Cómo se sabe que ha funcionado

La vista responde en producción y sus números reproducen la medición del 24 de julio. Se
puede pedir "los 20 ingredientes con menos recetas de la categoría salsas" en una sola
consulta, y eso es exactamente lo que hacía falta para dirigir la generación en vez de
ampliar el catálogo a ciegas como en las tandas que dejaron 52 títulos duplicados.

Lo que **no** hace este slice: no genera ninguna receta, no retira las duplicadas y no
toca el prompt de generación. Son los slices siguientes de la fase B.
