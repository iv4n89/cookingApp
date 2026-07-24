begin;

select plan(9);

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
  public.household_today_decision('cena', 5)->'featured'->>'recipeId',
  '00000000-0000-0000-0000-000000009301',
  'La receta que usa el prioritario es la destacada'
);
select is(
  public.household_today_decision('cena', 5)->'featured'->>'title',
  'Compota de manzana',
  'La destacada trae datos de pintado (título)'
);
select is(
  public.household_today_decision('cena', 5)->'featured'->>'mode',
  'cook_now',
  'Con el ingrediente en despensa la destacada es cook_now'
);
select is(
  jsonb_typeof(public.household_today_decision('cena', 5)->'shoppingMissing'),
  'array',
  'shoppingMissing es siempre un array'
);

update public.user_preferences set special_needs = array['Halal'] where user_id = '00000000-0000-0000-0000-000000000901';

select is(
  public.household_today_decision('cena', 5)->>'decisionReason',
  'unsupported_household_restriction',
  'Una restricción no soportada corta la decisión'
);

select * from finish();
rollback;
