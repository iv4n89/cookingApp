begin;

select plan(20);

select has_function('public', 'household_today_decision', array['text', 'integer'], 'Existe la RPC compositora de la decisión de hoy');
select ok(
  has_function_privilege('authenticated', 'public.household_today_decision(text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.household_today_decision(text,integer)', 'EXECUTE'),
  'Solo authenticated puede ejecutarla'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000901',
  'authenticated', 'authenticated', 'today-owner@example.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config(
  'test.today_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000901'),
  true
);

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values ('00000000-0000-0000-0000-000000000901', '{}', '{}', '');

-- Perfil de caducidad corto para forzar el estado 'priority' a los 30 días.
-- 'manzana golden' ya trae un perfil directo sembrado por el catálogo (0049), así
-- que se reasigna con upsert en lugar de insertar (la clave primaria es ingredient_id).
insert into public.expiration_profiles (id, min_days, max_days, confidence, priority_eligible, source_id, source_ref)
values ('today-fresh', 5, 60, 'high', true, 'test', 'today')
on conflict (id) do update set
  min_days = excluded.min_days,
  max_days = excluded.max_days,
  confidence = excluded.confidence,
  priority_eligible = excluded.priority_eligible;

insert into public.ingredient_expiration_profiles (ingredient_id, profile_id, match_type)
values ((select id from public.ingredients where normalized_name = 'manzana golden'), 'today-fresh', 'direct')
on conflict (ingredient_id) do update set
  profile_id = excluded.profile_id,
  match_type = excluded.match_type;

insert into public.pantry_items (id, user_id, household_id, ingredient_id, name, quantity, unit, category)
values (
  '00000000-0000-0000-0000-000000009101',
  '00000000-0000-0000-0000-000000000901',
  current_setting('test.today_household')::uuid,
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 2, 'ud', 'Frutas'
);

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at
) values (
  '00000000-0000-0000-0000-000000009201',
  current_setting('test.today_household')::uuid,
  '00000000-0000-0000-0000-000000009101',
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 'Frutas', 'ud', 2, 2, 'manual', current_timestamp - interval '30 days'
);

insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000009301', 'Compota de manzana', 'generated', true, 'none',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'manzana golden'),
    'name', 'Manzana golden', 'quantity', 1, 'unit', 'ud'
  )),
  array['cena']
);

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009301', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

-- Segunda receta reusable, candidata shop_then_cook: su ingrediente ('arroz bomba')
-- no tiene lote en la despensa del hogar, así que queda por detrás de la
-- destacada (cook_now) entre las alternativas de la pista pantry.
insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000009302', 'Arroz con verduras', 'generated', true, 'none',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
  )),
  array['cena']
);

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009302', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

-- Seis recetas reusables más, todas shop_then_cook (mismo ingrediente ausente en
-- despensa que 9302: 'arroz bomba'), para que el motor devuelva más de 5 candidatas
-- y la pista discover deje de estar siempre vacía. Empatadas en todo el resto del
-- score, el desempate final es por recipeId ascendente, así que su orden de rango
-- queda determinado por el id: 9302 < 9303 < 9304 < 9305 (pista pantry, alternativas)
-- < 9306 < 9307 < 9308 (pista discover, rango > 5).
-- 9307 y 9308 comparten tags[1] ('italiana') para ejercer el distinct-on por cocina
-- de discover: solo una de las dos debe sobrevivir.
insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types, tags)
values
  (
    '00000000-0000-0000-0000-000000009303', 'Tacos de verduras', 'generated', true, 'none',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
      'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
    )),
    array['cena'], array['mexicana']
  ),
  (
    '00000000-0000-0000-0000-000000009304', 'Curry rojo de verduras', 'generated', true, 'none',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
      'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
    )),
    array['cena'], array['tailandesa']
  ),
  (
    '00000000-0000-0000-0000-000000009305', 'Okonomiyaki de verduras', 'generated', true, 'none',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
      'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
    )),
    array['cena'], array['japonesa']
  ),
  (
    '00000000-0000-0000-0000-000000009306', 'Musaka de verduras', 'generated', true, 'none',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
      'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
    )),
    array['cena'], array['griega']
  ),
  (
    '00000000-0000-0000-0000-000000009307', 'Risotto de verduras', 'generated', true, 'none',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
      'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
    )),
    array['cena'], array['italiana']
  ),
  (
    '00000000-0000-0000-0000-000000009308', 'Pasta al pesto', 'generated', true, 'none',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
      'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
    )),
    array['cena'], array['italiana']
  );

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009303', array['summer'], 'high', 'curated', 'test-v1'
  );
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009304', array['summer'], 'high', 'curated', 'test-v1'
  );
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009305', array['summer'], 'high', 'curated', 'test-v1'
  );
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009306', array['summer'], 'high', 'curated', 'test-v1'
  );
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009307', array['summer'], 'high', 'curated', 'test-v1'
  );
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009308', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

-- Séptima receta reusable, exclusiva de desayuno (meal_types = ['desayuno']), para
-- demostrar el filtro de la pista pantry por franja horaria (migración 0058): en
-- 'cena' esta candidata sigue siendo válida para el motor (puede salir en discover)
-- pero queda fuera de pantry; en 'desayuno' sí es elegible para pantry.
insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000009401', 'Tostada de prueba desayuno', 'generated', true, 'none',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
  )),
  array['desayuno']
);

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009401', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.household_today_decision('cena', 5)->'priorityProducts' @> jsonb_build_array(jsonb_build_object('name', 'Manzana golden', 'status', 'priority')),
  'El producto próximo a caducar aparece como prioritario'
);
select is(
  jsonb_typeof(public.household_today_decision('cena', 5)->'priorityProducts'),
  'array',
  'priorityProducts es siempre un array'
);
select is(
  public.household_today_decision('cena', 5)->'pantry'->'featured'->>'recipeId',
  '00000000-0000-0000-0000-000000009301',
  'La receta que usa el prioritario es la destacada'
);
select is(
  public.household_today_decision('cena', 5)->'pantry'->'featured'->>'title',
  'Compota de manzana',
  'La destacada trae datos de pintado (título)'
);
select is(
  public.household_today_decision('cena', 5)->'pantry'->'featured'->>'mode',
  'cook_now',
  'Con el ingrediente en despensa la destacada es cook_now'
);
select ok(
  public.household_today_decision('cena', 5)->'pantry'->'alternatives' @> jsonb_build_array(jsonb_build_object(
    'recipeId', '00000000-0000-0000-0000-000000009302', 'mode', 'shop_then_cook'
  )),
  'La receta cuyo ingrediente no está en despensa aparece como alternativa shop_then_cook'
);
select ok(
  jsonb_array_length(public.household_today_decision('cena', 5)->'pantry'->'alternatives') >= 1,
  'Hay al menos una alternativa cuando existe una segunda candidata'
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
select ok(
  jsonb_array_length(public.household_today_decision('cena', 5)->'discover') >= 1,
  'Con más de 5 candidatas seguras, discover deja de estar vacío'
);
select ok(
  public.household_today_decision('cena', 5)->'discover' @> jsonb_build_array(jsonb_build_object(
    'recipeId', '00000000-0000-0000-0000-000000009306'
  )),
  'La candidata de rango > 5 con cocina propia (griega) entra en discover'
);
select ok(
  not (
    public.household_today_decision('cena', 5)->'discover' @> jsonb_build_array(jsonb_build_object('recipeId', '00000000-0000-0000-0000-000000009307'))
    and
    public.household_today_decision('cena', 5)->'discover' @> jsonb_build_array(jsonb_build_object('recipeId', '00000000-0000-0000-0000-000000009308'))
  ),
  'Dos candidatas con el mismo tags[1] (italiana) no aparecen ambas en discover'
);

-- Filtro de la pista pantry por franja horaria (migración 0058).
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      coalesce(public.household_today_decision('cena', 5)->'pantry'->'alternatives', '[]'::jsonb)
      || jsonb_build_array(public.household_today_decision('cena', 5)->'pantry'->'featured')
    ) e where e->>'recipeId' = '00000000-0000-0000-0000-000000009401'
  ),
  'La receta exclusiva de desayuno se excluye de pantry en la cena'
);
select ok(
  exists (
    select 1 from jsonb_array_elements(
      coalesce(public.household_today_decision('desayuno', 5)->'pantry'->'alternatives', '[]'::jsonb)
      || jsonb_build_array(public.household_today_decision('desayuno', 5)->'pantry'->'featured')
    ) e where e->>'recipeId' = '00000000-0000-0000-0000-000000009401'
  ),
  'La receta exclusiva de desayuno es elegible en pantry para el desayuno'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(
      coalesce(public.household_today_decision('desayuno', 5)->'pantry'->'alternatives', '[]'::jsonb)
      || jsonb_build_array(public.household_today_decision('desayuno', 5)->'pantry'->'featured')
    ) e where e->>'recipeId' = '00000000-0000-0000-0000-000000009301'
  ),
  'La receta exclusiva de cena se excluye de pantry en el desayuno'
);

update public.user_preferences set special_needs = array['Halal'] where user_id = '00000000-0000-0000-0000-000000000901';

select is(
  public.household_today_decision('cena', 5)->>'decisionReason',
  'unsupported_household_restriction',
  'Una restricción no soportada corta la decisión'
);
select is(
  public.household_today_decision('cena', 5)->'pantry'->'featured',
  'null'::jsonb,
  'Sin candidatas seguras, la destacada de pantry es null'
);
select is(
  public.household_today_decision('cena', 5)->'discover',
  '[]'::jsonb,
  'Sin candidatas seguras, discover queda vacío'
);

select * from finish();
rollback;
