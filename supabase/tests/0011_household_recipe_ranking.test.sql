begin;

select plan(8);

select has_function('public', 'household_recipe_ranking', array['uuid[]', 'text', 'integer'], 'Existe la RPC household_recipe_ranking');
select ok(
  has_function_privilege('authenticated', 'public.household_recipe_ranking(uuid[],text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.household_recipe_ranking(uuid[],text,integer)', 'EXECUTE'),
  'Solo authenticated puede ejecutarla'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000902',
  'authenticated', 'authenticated', 'ranking-owner@example.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config(
  'test.ranking_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000902'),
  true
);

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values ('00000000-0000-0000-0000-000000000902', '{}', '{}', '');

-- Despensa: el hogar tiene 'manzana golden' en un lote con remaining_quantity > 0.
insert into public.pantry_items (id, user_id, household_id, ingredient_id, name, quantity, unit, category)
values (
  '00000000-0000-0000-0000-000000009601',
  '00000000-0000-0000-0000-000000000902',
  current_setting('test.ranking_household')::uuid,
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 3, 'ud', 'Frutas'
);

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at
) values (
  '00000000-0000-0000-0000-000000009602',
  current_setting('test.ranking_household')::uuid,
  '00000000-0000-0000-0000-000000009601',
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 'Frutas', 'ud', 3, 3, 'manual', current_timestamp
);

-- Receta A: cook_now, solo usa el ingrediente que está en despensa (0 faltantes).
insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000009701', 'Compota de manzana', 'generated', true, 'none',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'manzana golden'),
    'name', 'Manzana golden', 'quantity', 1, 'unit', 'ud'
  )),
  array['cena']
);

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009701', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

-- Receta B: shop_then_cook, usa un ingrediente ausente de la despensa ('arroz bomba').
insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000009702', 'Arroz con verduras', 'generated', true, 'none',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'name', 'Arroz bomba', 'quantity', 1, 'unit', 'kg'
  )),
  array['cena']
);

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009702', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- (b) Rankeando A (cook_now) y B (shop_then_cook), gana A y no tiene faltantes.
select is(
  public.household_recipe_ranking(
    array['00000000-0000-0000-0000-000000009701'::uuid, '00000000-0000-0000-0000-000000009702'::uuid]
  )->'candidates'->0->>'recipeId',
  '00000000-0000-0000-0000-000000009701',
  'La receta cook_now (cubierta por la despensa) queda primera'
);
select is(
  (public.household_recipe_ranking(
    array['00000000-0000-0000-0000-000000009701'::uuid, '00000000-0000-0000-0000-000000009702'::uuid]
  )->'candidates'->0->'score'->>'missingIngredientCount')::integer,
  0,
  'La receta ganadora no tiene faltantes'
);

-- (c) Pedir solo la shop_then_cook filtra a esa única candidata, con faltantes.
select is(
  jsonb_array_length(public.household_recipe_ranking(
    array['00000000-0000-0000-0000-000000009702'::uuid]
  )->'candidates'),
  1,
  'Pedir solo el id shop_then_cook devuelve una única candidata'
);
select ok(
  (public.household_recipe_ranking(
    array['00000000-0000-0000-0000-000000009702'::uuid]
  )->'candidates'->0->'score'->>'missingIngredientCount')::integer > 0,
  'La única candidata pedida tiene faltantes'
);

-- (d) Lista vacía o NULL siempre devuelven candidates: []
select is(
  public.household_recipe_ranking(array[]::uuid[])->'candidates',
  '[]'::jsonb,
  'Lista de ids vacía devuelve candidates: []'
);
select is(
  public.household_recipe_ranking(null::uuid[])->'candidates',
  '[]'::jsonb,
  'NULL como lista de ids devuelve candidates: []'
);

select * from finish();
rollback;
