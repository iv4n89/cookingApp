begin;

select plan(6);

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

reset role;
select * from finish();
rollback;
