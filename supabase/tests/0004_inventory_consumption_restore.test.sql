begin;

select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000505',
  'authenticated', 'authenticated', 'consume@example.test', 'not-used-in-test', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.ingredients (id, name, normalized_name, category)
values ('00000000-0000-0000-0000-000000005001', 'Harina', 'harina-test-fefo', 'Otros');

insert into public.ingredients (id, name, normalized_name, category, canonical_id)
values (
  '00000000-0000-0000-0000-000000005003',
  'Harina de trigo',
  'harina-trigo-test-canon',
  'Otros',
  '00000000-0000-0000-0000-000000005001'
);

insert into public.recipes (id, title, source, servings, ingredients)
values
  (
    '00000000-0000-0000-0000-000000005002',
    'Masa FEFO',
    'generated',
    1,
    '[{"ingredient_id":"00000000-0000-0000-0000-000000005001","quantity":6,"unit":"g"}]'
  ),
  (
    '00000000-0000-0000-0000-000000005004',
    'Masa canónica',
    'generated',
    1,
    '[{"ingredient_id":"00000000-0000-0000-0000-000000005003","quantity":500,"unit":"g"}]'
  );

insert into public.pantry_items (
  id, user_id, household_id, ingredient_id, name, quantity, unit, category
)
select
  item_id,
  hm.user_id,
  hm.household_id,
  '00000000-0000-0000-0000-000000005001',
  item_name,
  quantity,
  'g',
  'Otros'
from public.household_members hm
cross join (
  values
    ('00000000-0000-0000-0000-000000005011'::uuid, 'Harina nueva', 5::numeric),
    ('00000000-0000-0000-0000-000000005012'::uuid, 'Harina antigua', 7::numeric)
) items(item_id, item_name, quantity)
where hm.user_id = '00000000-0000-0000-0000-000000000505';

insert into public.pantry_items (
  id, user_id, household_id, ingredient_id, name, quantity, unit, category
)
select
  '00000000-0000-0000-0000-000000005013',
  hm.user_id,
  hm.household_id,
  '00000000-0000-0000-0000-000000005001',
  'Harina por kilos',
  1,
  'kg',
  'Otros'
from public.household_members hm
where hm.user_id = '00000000-0000-0000-0000-000000000505';

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at
)
select
  batch_id,
  hm.household_id,
  pantry_item_id,
  '00000000-0000-0000-0000-000000005001',
  batch_name,
  'Otros',
  'g',
  quantity,
  quantity,
  'manual',
  purchased_at
from public.household_members hm
cross join (
  values
    (
      '00000000-0000-0000-0000-000000005021'::uuid,
      '00000000-0000-0000-0000-000000005011'::uuid,
      'Harina nueva',
      5::numeric,
      '2026-07-20 10:00:00+00'::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000005022'::uuid,
      '00000000-0000-0000-0000-000000005012'::uuid,
      'Harina antigua',
      7::numeric,
      '2026-07-10 10:00:00+00'::timestamptz
    )
) batches(batch_id, pantry_item_id, batch_name, quantity, purchased_at)
where hm.user_id = '00000000-0000-0000-0000-000000000505';

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at
)
select
  '00000000-0000-0000-0000-000000005023',
  hm.household_id,
  '00000000-0000-0000-0000-000000005013',
  '00000000-0000-0000-0000-000000005001',
  'Harina por kilos',
  'Otros',
  'kg',
  1,
  1,
  'manual',
  '2026-07-15 10:00:00+00'
from public.household_members hm
where hm.user_id = '00000000-0000-0000-0000-000000000505';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000505', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$ select public.cook_recipe_for_household(
       '00000000-0000-0000-0000-000000005002',
       1,
       '00000000-0000-0000-0000-000000005031'
     ) $$,
  'Cocinar consume mediante el comando del hogar'
);

select results_eq(
  $$ select quantity from public.pantry_items where id = '00000000-0000-0000-0000-000000005011' $$,
  $$ values (5::numeric) $$,
  'FEFO no descuenta la proyección del lote más nuevo'
);

select results_eq(
  $$ select quantity from public.pantry_items where id = '00000000-0000-0000-0000-000000005012' $$,
  $$ values (1::numeric) $$,
  'FEFO descuenta la proyección propietaria del lote más antiguo'
);

select results_eq(
  $$ select remaining_quantity from public.pantry_batches where id = '00000000-0000-0000-0000-000000005022' $$,
  $$ values (1::numeric) $$,
  'El lote y su proyección permanecen reconciliados'
);

select lives_ok(
  $$ select public.remove_pantry_item(
       '00000000-0000-0000-0000-000000005012',
       '00000000-0000-0000-0000-000000005032'
     ) $$,
  'Eliminar la proyección antes de restaurar vacía el remanente'
);

select lives_ok(
  $$ select public.restore_cooked_recipe(
       (select id from public.cooked_recipes where recipe_id = '00000000-0000-0000-0000-000000005002'),
       '00000000-0000-0000-0000-000000005033'
     ) $$,
  'Restaurar recrea la proyección eliminada'
);

select results_eq(
  $$ select quantity from public.pantry_items where id = '00000000-0000-0000-0000-000000005012' $$,
  $$ values (6::numeric) $$,
  'La proyección recreada contiene exactamente la cantidad cocinada'
);

select lives_ok(
  $$ select public.restore_cooked_recipe(
       (select id from public.cooked_recipes where recipe_id = '00000000-0000-0000-0000-000000005002'),
       '00000000-0000-0000-0000-000000005033'
     ) $$,
  'Reintentar restore con la misma clave es idempotente'
);

select results_eq(
  $$ select count(*)::int
     from public.inventory_events e
     join public.inventory_commands c on c.id = e.command_id
     where e.event_type = 'restore'
       and c.idempotency_key = '00000000-0000-0000-0000-000000005033' $$,
  $$ values (1::int) $$,
  'El reintento solo registra un evento restore enlazado a su comando'
);

select lives_ok(
  $$ select public.cook_recipe_for_household(
       '00000000-0000-0000-0000-000000005004',
       1,
       '00000000-0000-0000-0000-000000005034'
     ) $$,
  'El consumo encuentra ingredientes canónicos y convierte gramos a kilos'
);

select results_eq(
  $$ select quantity from public.pantry_items where id = '00000000-0000-0000-0000-000000005013' $$,
  $$ values (0.506::numeric) $$,
  'Tras agotar primero 6 g por FEFO, la conversión descuenta los 494 g restantes del lote en kg'
);

select lives_ok(
  $$ select public.cook_recipe_for_household(
       '00000000-0000-0000-0000-000000005004',
       1,
       '00000000-0000-0000-0000-000000005034'
     ) $$,
  'Reintentar cook con la misma clave usa el comando previo'
);

select results_eq(
  $$ select quantity from public.pantry_items where id = '00000000-0000-0000-0000-000000005013' $$,
  $$ values (0.506::numeric) $$,
  'El reintento de cook no descuenta stock por segunda vez'
);

reset role;
select * from finish();
rollback;
