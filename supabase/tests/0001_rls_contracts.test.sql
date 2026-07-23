begin;

select plan(7);

select has_table('public', 'pantry_items', 'La despensa está expuesta como read model protegido');
select policies_are(
  'public',
  'pantry_items',
  array['pantry_select_household'],
  'La despensa solo expone lectura a miembros del hogar'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000101',
    'authenticated',
    'authenticated',
    'rls-owner@example.test',
    'not-used-in-test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000202',
    'authenticated',
    'authenticated',
    'rls-other@example.test',
    'not-used-in-test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

select results_eq(
  $$ select count(*)::int from public.household_members
     where user_id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202') $$,
  $$ values (2::int) $$,
  'El trigger crea un hogar personal para cada usuario nuevo'
);

insert into public.pantry_items (user_id, household_id, name, quantity, unit)
select hm.user_id, hm.household_id,
       case when hm.user_id = '00000000-0000-0000-0000-000000000101'::uuid then 'Lentejas' else 'Arroz' end,
       1,
       case when hm.user_id = '00000000-0000-0000-0000-000000000101'::uuid then 'bote' else 'kg' end
from public.household_members hm
where hm.user_id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202');

select set_config(
  'test.other_household_id',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000202'),
  true
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select results_eq(
  $$ select array_agg(name order by name) from public.pantry_items $$,
  $$ values (array['Lentejas']::text[]) $$,
  'RLS no expone la despensa de otro usuario'
);

select throws_ok(
  $$ update public.pantry_items set quantity = 2 where name = 'Arroz' returning id $$,
  '42501', null,
  'El rol autenticado no puede modificar la proyección de despensa'
);

select throws_ok(
  $$ insert into public.pantry_items (user_id, household_id, name, quantity, unit)
     values ('00000000-0000-0000-0000-000000000202', current_setting('test.other_household_id')::uuid, 'Harina', 1, 'kg') $$,
  '42501',
  null,
  'RLS rechaza crear stock para otro hogar'
);

select throws_ok(
  $$ delete from public.pantry_items where name = 'Arroz' returning id $$,
  '42501', null,
  'El rol autenticado no puede borrar la proyección de despensa'
);

reset role;
select * from finish();

rollback;
