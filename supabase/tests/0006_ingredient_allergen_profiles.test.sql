begin;

select plan(30);

select has_table(
  'public',
  'ingredient_allergen_datasets',
  'Existe el registro versionado del dataset'
);
select has_table(
  'public',
  'ingredient_allergen_profiles',
  'Existe el perfil padre por ingrediente exacto'
);
select has_table(
  'public',
  'ingredient_allergen_entries',
  'Existen las entradas normalizadas de exclusiones'
);
select has_table(
  'public',
  'ingredient_diet_entries',
  'Existen las incompatibilidades dietéticas normalizadas'
);

select is(
  (
    select count(*)
    from public.ingredient_allergen_profiles
    where dataset_version = 'ingredient-allergens-es-v1'
  ),
  399::bigint,
  'El dataset v1 cubre exactamente los 399 ingredientes canónicos'
);

select ok(
  (
    select sha256 ~ '^[0-9a-f]{64}$'
    from public.ingredient_allergen_datasets
    where version = 'ingredient-allergens-es-v1'
  ),
  'El dataset persiste un checksum SHA-256'
);

select is(
  (
    select p.composition_status
    from public.ingredient_allergen_profiles p
    join public.ingredients i on i.id = p.ingredient_id
    where i.normalized_name = 'manzana golden'
  ),
  'exact_reviewed',
  'Un ingrediente simple queda revisado de forma exacta'
);

select is(
  (
    select count(*)
    from public.ingredient_allergen_entries e
    join public.ingredients i on i.id = e.ingredient_id
    where i.normalized_name = 'manzana golden'
  ),
  0::bigint,
  'Un padre exacto sin entries representa una lista vacía explícita'
);

select is(
  (
    select p.composition_status
    from public.ingredient_allergen_profiles p
    join public.ingredients i on i.id = p.ingredient_id
    where i.normalized_name = 'salsa barbacoa'
  ),
  'variable_unknown',
  'Un preparado genérico conserva composición desconocida'
);

select is(
  (
    select count(*)
    from public.ingredient_allergen_entries e
    join public.ingredients i on i.id = e.ingredient_id
    where i.normalized_name = 'salsa barbacoa'
  ),
  0::bigint,
  'Un preparado variable vacío no inventa alérgenos conocidos'
);

select is(
  (
    select p.composition_status
    from public.ingredient_allergen_profiles p
    join public.ingredients i on i.id = p.ingredient_id
    where i.normalized_name = 'queso parmesano'
  ),
  'variable_unknown',
  'Un queso sin cuajo especificado no acredita dieta vegetariana'
);

select is(
  (
    select p.composition_status
    from public.ingredient_allergen_profiles p
    join public.ingredients i on i.id = p.ingredient_id
    where i.normalized_name = 'nata para cocinar'
  ),
  'variable_unknown',
  'Un lácteo formulado sin composición concreta falla cerrado'
);

select results_eq(
  $$
    select d.incompatible_diet
    from public.ingredient_diet_entries d
    join public.ingredients i on i.id = d.ingredient_id
    where i.normalized_name = 'leche entera'
    order by d.incompatible_diet
  $$,
  $$ values ('vegan'::text) $$,
  'La leche es incompatible con dieta vegana'
);

select results_eq(
  $$
    select d.incompatible_diet
    from public.ingredient_diet_entries d
    join public.ingredients i on i.id = d.ingredient_id
    where i.normalized_name = 'pechuga de pollo'
    order by d.incompatible_diet
  $$,
  $$ values ('vegan'::text), ('vegetarian'::text) $$,
  'La carne es incompatible con dietas vegana y vegetariana'
);

select throws_ok(
  $$
    insert into public.ingredient_allergen_entries (ingredient_id, allergen)
    select id, 'celery'
    from public.ingredients
    where normalized_name = 'apio'
  $$,
  '23505',
  null,
  'No se permiten entries duplicadas'
);

select throws_ok(
  $$
    insert into public.ingredient_allergen_entries (ingredient_id, allergen)
    select id, 'sulphites'
    from public.ingredients
    where normalized_name = 'apio'
  $$,
  '23514',
  null,
  'El vocabulario de exclusiones está cerrado'
);

select throws_ok(
  $$
    insert into public.ingredient_diet_entries (ingredient_id, incompatible_diet)
    select id, 'keto'
    from public.ingredients
    where normalized_name = 'apio'
  $$,
  '23514',
  null,
  'El vocabulario de dietas está cerrado'
);

insert into public.ingredients (id, name, normalized_name, category)
values
  (
    '00000000-0000-0000-0000-000000007001',
    'Raíz canónica safety test',
    'raiz-canonica-safety-test',
    'Otros'
  ),
  (
    '00000000-0000-0000-0000-000000007002',
    'Directo safety test',
    'directo-safety-test',
    'Otros'
  ),
  (
    '00000000-0000-0000-0000-000000007003',
    'Directo sin perfil safety test',
    'directo-sin-perfil-safety-test',
    'Otros'
  ),
  (
    '00000000-0000-0000-0000-000000007004',
    'Perfil inválido safety test',
    'perfil-invalido-safety-test',
    'Otros'
  );

update public.ingredients
set canonical_id = '00000000-0000-0000-0000-000000007001'
where id in (
  '00000000-0000-0000-0000-000000007002',
  '00000000-0000-0000-0000-000000007003'
);

select throws_ok(
  $$
    insert into public.ingredient_allergen_profiles (
      ingredient_id,
      dataset_version,
      source_ids,
      source_ref,
      review_kind,
      composition_status
    ) values (
      '00000000-0000-0000-0000-000000007004',
      'ingredient-allergens-es-v1',
      array['test'],
      'test',
      'intrinsic_named_ingredient',
      'variable_unknown'
    )
  $$,
  '23514',
  null,
  'El estado variable exige la clase de revisión correspondiente'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'ingredient_allergen_datasets',
        'ingredient_allergen_profiles',
        'ingredient_allergen_entries',
        'ingredient_diet_entries'
      )
  ),
  'RLS está habilitado en las cuatro tablas'
);

select ok(
  has_table_privilege('authenticated', 'public.ingredient_allergen_datasets', 'SELECT')
  and has_table_privilege('authenticated', 'public.ingredient_allergen_profiles', 'SELECT')
  and has_table_privilege('authenticated', 'public.ingredient_allergen_entries', 'SELECT')
  and has_table_privilege('authenticated', 'public.ingredient_diet_entries', 'SELECT'),
  'Authenticated puede leer las cuatro tablas globales'
);

select ok(
  not has_table_privilege('authenticated', 'public.ingredient_allergen_datasets', 'INSERT')
  and not has_table_privilege('authenticated', 'public.ingredient_allergen_profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ingredient_allergen_entries', 'DELETE')
  and not has_table_privilege('authenticated', 'public.ingredient_diet_entries', 'INSERT'),
  'Authenticated no puede modificar los metadatos'
);

select ok(
  not has_table_privilege('anon', 'public.ingredient_allergen_datasets', 'SELECT')
  and not has_table_privilege('anon', 'public.ingredient_allergen_profiles', 'SELECT')
  and not has_table_privilege('anon', 'public.ingredient_allergen_entries', 'SELECT')
  and not has_table_privilege('anon', 'public.ingredient_diet_entries', 'SELECT'),
  'Anon no puede leer los metadatos'
);

select ok(
  has_table_privilege('service_role', 'public.ingredient_allergen_datasets', 'INSERT')
  and has_table_privilege('service_role', 'public.ingredient_allergen_profiles', 'UPDATE')
  and has_table_privilege('service_role', 'public.ingredient_allergen_entries', 'DELETE')
  and has_table_privilege('service_role', 'public.ingredient_diet_entries', 'INSERT'),
  'Service role conserva DML'
);

select policies_are(
  'public',
  'ingredient_allergen_datasets',
  array['ingredient_allergen_datasets_select_authenticated'],
  'El dataset solo declara la policy de lectura autenticada'
);
select policies_are(
  'public',
  'ingredient_allergen_profiles',
  array['ingredient_allergen_profiles_select_authenticated'],
  'Los perfiles solo declaran la policy de lectura autenticada'
);
select policies_are(
  'public',
  'ingredient_allergen_entries',
  array['ingredient_allergen_entries_select_authenticated'],
  'Los alérgenos solo declaran la policy de lectura autenticada'
);
select policies_are(
  'public',
  'ingredient_diet_entries',
  array['ingredient_diet_entries_select_authenticated'],
  'Las dietas solo declaran la policy de lectura autenticada'
);

insert into public.ingredient_allergen_profiles (
  ingredient_id,
  dataset_version,
  source_ids,
  source_ref,
  review_kind,
  composition_status
) values
  (
    '00000000-0000-0000-0000-000000007001',
    'ingredient-allergens-es-v1',
    array['test'],
    'perfil canónico',
    'intrinsic_named_ingredient',
    'exact_reviewed'
  ),
  (
    '00000000-0000-0000-0000-000000007002',
    'ingredient-allergens-es-v1',
    array['test'],
    'perfil directo',
    'intrinsic_named_ingredient',
    'exact_reviewed'
  );

insert into public.ingredient_allergen_entries (ingredient_id, allergen)
values
  ('00000000-0000-0000-0000-000000007001', 'sesame'),
  ('00000000-0000-0000-0000-000000007002', 'milk');

select results_eq(
  $$
    select e.allergen
    from public.ingredient_allergen_profiles p
    join public.ingredient_allergen_entries e on e.ingredient_id = p.ingredient_id
    where p.ingredient_id = '00000000-0000-0000-0000-000000007002'
  $$,
  $$ values ('milk'::text) $$,
  'La seguridad usa el perfil exacto aunque el canónico sea diferente'
);

select is(
  (
    select count(*)
    from public.ingredient_allergen_profiles p
    where p.ingredient_id = '00000000-0000-0000-0000-000000007003'
  ),
  0::bigint,
  'La ausencia de perfil directo no usa fallback canónico'
);

delete from public.ingredient_allergen_profiles
where ingredient_id = '00000000-0000-0000-0000-000000007002';

select is(
  (
    select count(*)
    from public.ingredient_allergen_entries
    where ingredient_id = '00000000-0000-0000-0000-000000007002'
  ),
  0::bigint,
  'Las entries se eliminan en cascada con su perfil'
);

select * from finish();

rollback;
