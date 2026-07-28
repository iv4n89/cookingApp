begin;

select plan(15);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000404',
  'authenticated', 'authenticated', 'projection@example.test', 'not-used-in-test', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$ select public.add_pantry_item('Arroz', 10, 'g', 'Otros', null, null, '00000000-0000-0000-0000-000000004001') $$,
  'Añadir una proyección crea su lote asociado'
);

select lives_ok(
  $$ select public.set_pantry_quantity((select id from public.pantry_items where name = 'Arroz'), 4, '00000000-0000-0000-0000-000000004002') $$,
  'Reducir una cantidad reconcilia los lotes'
);

select results_eq(
  $$ select coalesce(sum(remaining_quantity), 0) from public.pantry_batches where pantry_item_id = (select id from public.pantry_items where name = 'Arroz') $$,
  $$ values (4::numeric) $$,
  'La proyección y la suma de sus lotes coinciden tras el ajuste'
);

select lives_ok(
  $$ select public.remove_pantry_item((select id from public.pantry_items where name = 'Arroz'), '00000000-0000-0000-0000-000000004003') $$,
  'Eliminar una proyección vacía sus lotes'
);

select results_eq(
  $$ select coalesce(sum(remaining_quantity), 0) from public.pantry_batches where name = 'Arroz' $$,
  $$ values (0::numeric) $$,
  'No queda stock invisible tras eliminar la proyección'
);

select ok(
  not has_function_privilege('authenticated', 'public.apply_cook(uuid,integer,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.buy_shopping_items(uuid[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.uncook_recipe(uuid)', 'EXECUTE'),
  'Las RPC heredadas que evitan el ledger no son ejecutables por clientes'
);

select lives_ok(
  $$ select public.add_pantry_item('Leche', 1, 'l', 'Otros', null, null, '00000000-0000-0000-0000-000000004004') $$,
  'Añadir un producto que no está en la despensa lo crea'
);

select lives_ok(
  $$ select public.add_pantry_item('leche', 2, 'l', 'Otros', null, null, '00000000-0000-0000-0000-000000004005') $$,
  'Volver a añadir el mismo producto no falla'
);

select results_eq(
  $$ select count(*), sum(quantity) from public.pantry_items where lower(name) = 'leche' and unit = 'l' $$,
  $$ values (1::bigint, 3::numeric) $$,
  'Dos altas del mismo producto suman en una sola fila de la despensa'
);

select results_eq(
  $$ select count(*) from public.pantry_batches where lower(name) = 'leche' and unit = 'l' $$,
  $$ values (2::bigint) $$,
  'Cada alta conserva su propio lote: caducan por separado'
);

select lives_ok(
  $$ select public.add_pantry_item('Leche', 1, 'unidad', 'Otros', null, null, '00000000-0000-0000-0000-000000004006') $$,
  'Añadir el mismo nombre en otra unidad no falla'
);

select results_eq(
  $$ select count(*) from public.pantry_items where lower(name) = 'leche' $$,
  $$ values (2::bigint) $$,
  'En otra unidad sigue siendo otro producto: litros y unidades no se pueden sumar'
);

select lives_ok(
  $$ select public.add_pantry_item('Sal', null, 'g', 'Otros', null, 100, '00000000-0000-0000-0000-000000004007') $$,
  'Se puede añadir un producto sin cantidad'
);

select lives_ok(
  $$ select public.add_pantry_item('Sal', null, 'g', 'Otros', null, 100, '00000000-0000-0000-0000-000000004008') $$,
  'Se puede volver a añadir sin cantidad'
);

select results_eq(
  $$ select quantity from public.pantry_items where name = 'Sal' $$,
  $$ values (null::numeric) $$,
  'Dos altas sin cantidad la dejan sin medir, no en cero: si no, contaría como bajo stock'
);

reset role;
select * from finish();
rollback;
