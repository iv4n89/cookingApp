begin;

select plan(3);

select has_table('public', 'pantry_items', 'La despensa está expuesta como read model protegido');
select policies_are(
  'public',
  'pantry_items',
  array['pantry_all_own'],
  'La despensa actual conserva una única política de titularidad'
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

insert into public.pantry_items (user_id, name, quantity, unit)
values
  ('00000000-0000-0000-0000-000000000101', 'Lentejas', 1, 'bote'),
  ('00000000-0000-0000-0000-000000000202', 'Arroz', 1, 'kg');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select results_eq(
  $$ select array_agg(name order by name) from public.pantry_items $$,
  $$ values (array['Lentejas']::text[]) $$,
  'RLS no expone la despensa de otro usuario'
);

reset role;
select * from finish();

rollback;
