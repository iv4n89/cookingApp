begin;

select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000303',
  'authenticated', 'authenticated', 'commands@example.test', 'not-used-in-test', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  public.add_shopping_item('Tomate', 2, 'ud', null, null, '00000000-0000-0000-0000-000000003001'),
  public.add_shopping_item('Tomate', 2, 'ud', null, null, '00000000-0000-0000-0000-000000003001'),
  'Reintentar añadir a compra devuelve el mismo item'
);

select lives_ok(
  $$ select public.complete_shopping_items(
       array[(select id from public.shopping_list_items where name = 'Tomate')],
       '00000000-0000-0000-0000-000000003002'
     ) $$,
  'Completar la compra crea el inventario'
);

select lives_ok(
  $$ select public.complete_shopping_items(
       array['00000000-0000-0000-0000-000000000000'::uuid],
       '00000000-0000-0000-0000-000000003002'
     ) $$,
  'Reintentar la compra usa el resultado almacenado aunque ya no exista el item'
);

select results_eq(
  $$ select count(*)::int from public.pantry_batches where name = 'Tomate' $$,
  $$ values (1::int) $$,
  'El reintento no duplica lotes ni eventos de compra'
);

reset role;
select * from finish();
rollback;
