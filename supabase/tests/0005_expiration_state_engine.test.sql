begin;

select plan(23);

select throws_ok(
  $$ insert into public.expiration_profiles (
       id, min_days, max_days, confidence, priority_eligible, source_id, source_ref
     ) values (
       'invalid-null-min', null, 10, 'low', false, 'test', 'test'
     ) $$,
  '23514',
  null,
  'Un perfil no puede declarar solo maxDays'
);

select throws_ok(
  $$ insert into public.expiration_profiles (
       id, min_days, max_days, confidence, priority_eligible, source_id, source_ref
     ) values (
       'invalid-null-max', 10, null, 'low', false, 'test', 'test'
     ) $$,
  '23514',
  null,
  'Un perfil no puede declarar solo minDays'
);

-- Límites deterministas del evaluador privado.
select is(
  (select status from public.evaluate_expiration_state(4, 6, true, '2026-07-01 00:00:00+00', '2026-07-03 23:58:33.6+00')),
  'fresh',
  'Antes de consumeSoonAt el lote está fresh'
);
select is(
  (select status from public.evaluate_expiration_state(4, 6, true, '2026-07-01 00:00:00+00', '2026-07-04 00:00:00+00')),
  'consume_soon',
  'En consumeSoonAt el lote pasa a consume_soon'
);
select is(
  (select status from public.evaluate_expiration_state(4, 6, true, '2026-07-01 00:00:00+00', '2026-07-05 00:00:00+00')),
  'priority',
  'En minDays el lote pasa a priority'
);
select is(
  (select status from public.evaluate_expiration_state(4, 6, true, '2026-07-01 00:00:00+00', '2026-07-07 00:00:00+00')),
  'priority',
  'En maxDays el lote todavía es priority'
);
select is(
  (select status from public.evaluate_expiration_state(4, 6, true, '2026-07-01 00:00:00+00', '2026-07-07 00:00:00.001+00')),
  null::text,
  'Después de maxDays el lote no tiene estado accionable'
);
select is(
  (select status from public.evaluate_expiration_state(1, 2, true, '2026-07-01 00:00:00+00', '2026-07-01 18:00:00+00')),
  'consume_soon',
  'Un perfil corto usa el último 25 por ciento antes de minDays'
);
select is(
  (select status from public.evaluate_expiration_state(100, 120, true, '2026-01-01 00:00:00+00', '2026-04-03 00:00:00+00')),
  'fresh',
  'Un perfil largo permanece fresh antes del aviso limitado'
);
select is(
  (select status from public.evaluate_expiration_state(100, 120, true, '2026-01-01 00:00:00+00', '2026-04-04 00:00:00+00')),
  'consume_soon',
  'El aviso de un perfil largo está limitado a siete días'
);
select is(
  (select age_days from public.evaluate_expiration_state(4, 6, true, '2026-07-02 00:00:00+00', '2026-07-01 00:00:00+00')),
  0::numeric,
  'Una fecha futura se evalúa con edad cero'
);
select is(
  (select status from public.evaluate_expiration_state(10, 20, false, '2026-07-01 00:00:00+00', '2026-07-15 00:00:00+00')),
  null::text,
  'Un perfil no prioritizable con rango numérico no genera estado'
);
select is(
  (select status from public.evaluate_expiration_state(null, null, false, '2026-07-01 00:00:00+00', '2026-07-15 00:00:00+00')),
  null::text,
  'Un perfil indefinido no genera estado'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000601',
    'authenticated', 'authenticated', 'expiry-owner@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000602',
    'authenticated', 'authenticated', 'expiry-member@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000603',
    'authenticated', 'authenticated', 'expiry-external@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

select set_config(
  'test.expiry_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000601'),
  true
);

delete from public.households
where owner_user_id = '00000000-0000-0000-0000-000000000602';

insert into public.household_members (household_id, user_id, role)
values (
  current_setting('test.expiry_household')::uuid,
  '00000000-0000-0000-0000-000000000602',
  'member'
);

insert into public.ingredients (id, name, normalized_name, category)
values (
  '00000000-0000-0000-0000-000000006001',
  'Raíz canónica runtime',
  'raiz-canonica-runtime-expiry-test',
  'Otros'
);

update public.ingredients
set canonical_id = '00000000-0000-0000-0000-000000006001'
where normalized_name = 'manzana golden';

update public.ingredients
set canonical_id = (select id from public.ingredients where normalized_name = 'manzana golden')
where normalized_name = 'pera conferencia';

insert into public.pantry_items (
  id, user_id, household_id, ingredient_id, name, quantity, unit, category
) values
  (
    '00000000-0000-0000-0000-000000006101',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    (select id from public.ingredients where normalized_name = 'manzana golden'),
    'Manzana directa',
    1, 'ud', 'Frutas'
  ),
  (
    '00000000-0000-0000-0000-000000006102',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    (select id from public.ingredients where normalized_name = 'pera conferencia'),
    'Pera por canónico',
    1, 'ud', 'Frutas'
  ),
  (
    '00000000-0000-0000-0000-000000006103',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'Arroz por created_at',
    1, 'kg', 'Cereales'
  ),
  (
    '00000000-0000-0000-0000-000000006104',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    (select id from public.ingredients where normalized_name = 'manzana golden'),
    'Manzana fuera de ventana',
    1, 'ud', 'Frutas'
  ),
  (
    '00000000-0000-0000-0000-000000006105',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'Arroz agotado',
    0, 'kg', 'Cereales'
  ),
  (
    '00000000-0000-0000-0000-000000006106',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006001',
    'Ingrediente sin perfil',
    1, 'ud', 'Otros'
  ),
  (
    '00000000-0000-0000-0000-000000006107',
    '00000000-0000-0000-0000-000000000601',
    current_setting('test.expiry_household')::uuid,
    null,
    'Lote sin ingrediente',
    1, 'ud', 'Otros'
  );

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at, created_at
) values
  (
    '00000000-0000-0000-0000-000000006201',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006101',
    (select id from public.ingredients where normalized_name = 'manzana golden'),
    'Manzana directa', 'Frutas', 'ud', 1, 1, 'manual',
    current_timestamp - interval '30 days', current_timestamp
  ),
  (
    '00000000-0000-0000-0000-000000006202',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006102',
    (select id from public.ingredients where normalized_name = 'pera conferencia'),
    'Pera por canónico', 'Frutas', 'ud', 1, 1, 'manual',
    current_timestamp - interval '30 days', current_timestamp
  ),
  (
    '00000000-0000-0000-0000-000000006203',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006103',
    (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'Arroz por created_at', 'Cereales', 'kg', 1, 1, 'manual',
    null, current_timestamp - interval '30 days'
  ),
  (
    '00000000-0000-0000-0000-000000006204',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006104',
    (select id from public.ingredients where normalized_name = 'manzana golden'),
    'Manzana fuera de ventana', 'Frutas', 'ud', 1, 1, 'manual',
    current_timestamp - interval '50 days', current_timestamp
  ),
  (
    '00000000-0000-0000-0000-000000006205',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006105',
    (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'Arroz agotado', 'Cereales', 'kg', 0, 0, 'manual',
    current_timestamp - interval '30 days', current_timestamp
  ),
  (
    '00000000-0000-0000-0000-000000006206',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006106',
    '00000000-0000-0000-0000-000000006001',
    'Ingrediente sin perfil', 'Otros', 'ud', 1, 1, 'manual',
    current_timestamp - interval '2 days', current_timestamp
  ),
  (
    '00000000-0000-0000-0000-000000006207',
    current_setting('test.expiry_household')::uuid,
    '00000000-0000-0000-0000-000000006107',
    null,
    'Lote sin ingrediente', 'Otros', 'ud', 1, 1, 'manual',
    current_timestamp - interval '2 days', current_timestamp
  ),
  (
    '00000000-0000-0000-0000-000000006208',
    current_setting('test.expiry_household')::uuid,
    null,
    (select id from public.ingredients where normalized_name = 'arroz bomba'),
    'Lote huérfano', 'Cereales', 'kg', 1, 1, 'manual',
    current_timestamp - interval '30 days', current_timestamp
  );

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select results_eq(
  $$ select ingredient_name, status from public.household_expiration_snapshot() order by ingredient_name $$,
  $$ values
       ('Arroz por created_at'::text, 'fresh'::text),
       ('Manzana directa'::text, 'priority'::text),
       ('Pera por canónico'::text, 'priority'::text) $$,
  'El snapshot solo devuelve los tres lotes accionables'
);

select results_eq(
  $$ select min_days, match_type
     from public.household_expiration_snapshot()
     where ingredient_name = 'Manzana directa' $$,
  $$ values (28, 'direct'::text) $$,
  'Si el canónico runtime no tiene perfil usa el mapping directo'
);

select results_eq(
  $$ select min_days, canonical_ingredient_id
     from public.household_expiration_snapshot()
     where ingredient_name = 'Pera por canónico' $$,
  $$ select 28, id from public.ingredients where normalized_name = 'manzana golden' $$,
  'Si el canónico tiene perfil se prefiere frente al mapping directo'
);

select results_eq(
  $$ select acquired_at
     from public.household_expiration_snapshot()
     where ingredient_name = 'Arroz por created_at' $$,
  $$ values (current_timestamp - interval '30 days') $$,
  'Sin purchased_at el snapshot usa created_at'
);

select set_config(
  'test.expiry_snapshot',
  (select string_agg(batch_id::text, ',' order by batch_id) from public.household_expiration_snapshot()),
  true
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
set local role authenticated;

select is(
  (select string_agg(batch_id::text, ',' order by batch_id) from public.household_expiration_snapshot()),
  current_setting('test.expiry_snapshot'),
  'Dos miembros del hogar reciben el mismo snapshot'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
set local role authenticated;

select is(
  (select count(*)::int from public.household_expiration_snapshot()),
  0,
  'Un usuario externo no recibe lotes del hogar'
);

select lives_ok(
  $$ select id from public.expiration_profiles limit 1 $$,
  'Authenticated puede leer perfiles globales'
);

select throws_ok(
  $$ update public.expiration_profiles set confidence = 'low' where id = 'fruit-apple' $$,
  '42501',
  null,
  'Authenticated no puede modificar perfiles globales'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.evaluate_expiration_state(integer,integer,boolean,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'Authenticated no puede ejecutar el evaluador privado'
);

select ok(
  not has_function_privilege('anon', 'public.household_expiration_snapshot()', 'EXECUTE'),
  'Anon no puede ejecutar el snapshot'
);

reset role;
select * from finish();
rollback;
