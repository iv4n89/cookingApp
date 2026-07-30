begin;

select plan(21);

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

-- Tercera receta, también retirada, con un embedding que no comparte con nadie: find_similar_recipe
-- es top-1, así que para comprobar que ve las retiradas hace falta que sea la única candidata.
insert into public.recipes (id, title, source, reusable, image_status, embedding)
values (
  'facade00-0000-4000-8000-000000000103', 'Retirada única en su vector', 'generated', true, 'none',
  ('[0,1,' || repeat('0,', 765) || '0]')::vector
);

update public.recipes
set retired_at = now(), retired_reason = 'incoherent'
where id in (
  'facade00-0000-4000-8000-000000000102',
  'facade00-0000-4000-8000-000000000103'
);

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
  (select count(*) from jsonb_array_elements(
    public.discover_recipes_by_ingredients(
      array['facade00-0000-4000-8000-000000000010']::uuid[], 2, 50
    )
  ) d where d.value->>'recipeId' = 'facade00-0000-4000-8000-000000000102'),
  0::bigint,
  'El descubridor no ofrece recetas retiradas'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.discover_recipes_by_ingredients(
      array['facade00-0000-4000-8000-000000000010']::uuid[], 2, 50
    )
  ) d where d.value->>'recipeId' = 'facade00-0000-4000-8000-000000000101'),
  1::bigint,
  'La publicada sí sale en el descubridor'
);

-- Para el carrusel hace falta una semilla favorita: la publicada hace de semilla y la
-- retirada tiene el mismo embedding, así que sin filtro saldría con afinidad máxima.
insert into public.user_recipes (user_id, recipe_id, is_favorite)
values ('facade00-0000-4000-8000-000000000901', 'facade00-0000-4000-8000-000000000101', true);

select is(
  (select count(*) from jsonb_array_elements(public.household_taste_recommendations(1000)) t
   where t.value->>'recipeId' = 'facade00-0000-4000-8000-000000000102'),
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

select is(
  (select f.id from public.find_similar_recipe(
    ('[0,1,' || repeat('0,', 765) || '0]')::vector, 0.9
  ) f),
  'facade00-0000-4000-8000-000000000103'::uuid,
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

-- Las dos recetas con ingrediente de las fixtures usan el mismo y una está retirada: la cobertura
-- tiene que ver una, no dos. Si contara las retiradas, retirar los 61 duplicados dejaría la
-- métrica de la fase B midiendo recetas que ya no existen para el usuario.
select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'facade00-0000-4000-8000-000000000010'),
  1::bigint,
  'La cobertura por ingrediente no cuenta las recetas retiradas'
);

select has_function(
  'public', 'retire_duplicate_recipes', array[]::text[],
  'Existe la función de limpieza de duplicados'
);

select ok(
  has_function_privilege('service_role', 'public.retire_duplicate_recipes()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.retire_duplicate_recipes()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.retire_duplicate_recipes()', 'EXECUTE'),
  'Solo service_role puede retirar recetas: no es algo que haga el móvil'
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

select * from finish();
rollback;
