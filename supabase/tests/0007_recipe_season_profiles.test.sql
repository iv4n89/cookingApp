begin;

select plan(24);

select has_table(
  'public',
  'recipe_season_profiles',
  'Existe el perfil estacional por receta'
);

select has_function(
  'public',
  'valid_recipe_seasons',
  array['text[]'],
  'Existe el validador del vocabulario estacional'
);

select has_function(
  'public',
  'upsert_recipe_season_profile',
  array['uuid', 'text[]', 'text', 'text', 'text'],
  'Existe el comando atómico de escritura'
);

select ok(
  public.valid_recipe_seasons(array['spring', 'summer']),
  'Acepta una lista estacional válida'
);
select ok(
  not public.valid_recipe_seasons(array[]::text[]),
  'Rechaza listas vacías'
);
select ok(
  not public.valid_recipe_seasons(array['summer', 'summer']),
  'Rechaza estaciones duplicadas'
);
select ok(
  not public.valid_recipe_seasons(array['summer', 'monsoon']),
  'Rechaza vocabulario desconocido'
);
select ok(
  not public.valid_recipe_seasons(array['all_year', 'winter']),
  'all_year es exclusivo'
);

insert into public.recipes (id, title, source)
values ('00000000-0000-0000-0000-000000008001', 'Perfil estacional test', 'generated');

select lives_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['winter'],
      'low',
      'backfill',
      'test-v1'
    )
  $$,
  'Backfill crea el perfil ausente'
);

select lives_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['summer'],
      'low',
      'generated',
      'test-v1'
    )
  $$,
  'Generated reemplaza backfill'
);

select is(
  (select seasons from public.recipe_season_profiles where recipe_id = '00000000-0000-0000-0000-000000008001'),
  array['summer']::text[],
  'Queda el perfil generated'
);

select lives_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['spring'],
      'high',
      'curated',
      'test-v1'
    )
  $$,
  'Curated reemplaza generated'
);

select lives_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['winter'],
      'low',
      'generated',
      'test-v2'
    )
  $$,
  'Generated no falla contra curated'
);

select is(
  (select source from public.recipe_season_profiles where recipe_id = '00000000-0000-0000-0000-000000008001'),
  'curated',
  'Generated nunca reemplaza curated'
);

select lives_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['autumn'],
      'low',
      'backfill',
      'test-v2'
    )
  $$,
  'Backfill no falla contra un perfil existente'
);

select is(
  (select seasons from public.recipe_season_profiles where recipe_id = '00000000-0000-0000-0000-000000008001'),
  array['spring']::text[],
  'Backfill nunca reemplaza un perfil existente'
);

select lives_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['spring'],
      'high',
      'curated',
      'test-v1'
    )
  $$,
  'Repetir el mismo origen y versión es idempotente'
);

select throws_ok(
  $$
    select public.upsert_recipe_season_profile(
      '00000000-0000-0000-0000-000000008001',
      array['all_year', 'winter'],
      'low',
      'generated',
      'test-v1'
    )
  $$,
  '22023',
  'invalid recipe season profile',
  'El comando rechaza perfiles inválidos'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.recipe_season_profiles'::regclass),
  'RLS está habilitado'
);

select policies_are(
  'public',
  'recipe_season_profiles',
  array['recipe_season_profiles_select_authenticated'],
  'Solo existe la policy global de lectura autenticada'
);

select ok(
  has_table_privilege('authenticated', 'public.recipe_season_profiles', 'SELECT')
  and not has_table_privilege('authenticated', 'public.recipe_season_profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.recipe_season_profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.recipe_season_profiles', 'DELETE'),
  'Authenticated solo puede leer'
);

select ok(
  not has_table_privilege('anon', 'public.recipe_season_profiles', 'SELECT'),
  'Anon no puede leer'
);

select ok(
  has_table_privilege('service_role', 'public.recipe_season_profiles', 'INSERT')
  and has_table_privilege('service_role', 'public.recipe_season_profiles', 'UPDATE')
  and has_function_privilege(
    'service_role',
    'public.upsert_recipe_season_profile(uuid,text[],text,text,text)',
    'EXECUTE'
  ),
  'Service role conserva el comando y DML'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.upsert_recipe_season_profile(uuid,text[],text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.upsert_recipe_season_profile(uuid,text[],text,text,text)',
    'EXECUTE'
  ),
  'El comando no es invocable por clientes'
);

select * from finish();
rollback;
