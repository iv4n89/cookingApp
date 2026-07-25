begin;

select plan(10);

select has_function(
  'public', 'discover_recipes_by_ingredients', array['uuid[]', 'integer', 'integer'],
  'Existe la RPC discover_recipes_by_ingredients'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.discover_recipes_by_ingredients(uuid[], integer, integer)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.discover_recipes_by_ingredients(uuid[], integer, integer)', 'EXECUTE'
  ),
  'Solo authenticated puede ejecutarla (la llama el móvil con el JWT del usuario)'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000904',
  'authenticated', 'authenticated', 'discoverer@example.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values ('00000000-0000-0000-0000-000000000904', '{}', '{}', '');

-- Ingredientes reales del catálogo local:
--   A = arroz bomba (d77ecb60...), B = manzana golden (b36fb066...).
--   sal fina (6949a962...) y aceite de oliva virgen extra (12b92ef3...) son "básicos" asumidos.
--   cebolla morada (aa7746d8...) es variante canónica de cebolla blanca (30f61048...).
--   aburaage y los aceites de ajo/argán/coco/sésamo/trufa son ingredientes sin canónico propio,
--   usados como "extras" no básicos.

-- R1: A + B + 1 extra (aburaage) -> 1 extra.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009911', 'Arroz con manzana y aburaage', 'generated', true, 'none',
  '[
    {"name":"Arroz bomba","unit":"g","quantity":200,"ingredient_id":"d77ecb60-f121-4478-8ade-ac6f36d4090b","substitutions":[]},
    {"name":"Manzana golden","unit":"g","quantity":100,"ingredient_id":"b36fb066-08bf-498a-ad86-00b06406919a","substitutions":[]},
    {"name":"Aburaage","unit":"g","quantity":50,"ingredient_id":"7fe6389c-2d27-4911-988a-2e32e85e03a1","substitutions":[]}
  ]'::jsonb
);

-- R2: A + B + 5 extras (aceites de ajo/argán/coco/sésamo/trufa) -> 5 extras.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009912', 'Arroz con manzana y cinco aceites', 'generated', true, 'none',
  '[
    {"name":"Arroz bomba","unit":"g","quantity":200,"ingredient_id":"d77ecb60-f121-4478-8ade-ac6f36d4090b","substitutions":[]},
    {"name":"Manzana golden","unit":"g","quantity":100,"ingredient_id":"b36fb066-08bf-498a-ad86-00b06406919a","substitutions":[]},
    {"name":"Aceite de ajo","unit":"ml","quantity":10,"ingredient_id":"59737168-f436-4151-8d23-1827b731f52c","substitutions":[]},
    {"name":"Aceite de argán","unit":"ml","quantity":10,"ingredient_id":"54f1a9b3-45c6-4ed7-8876-fa95e3236e73","substitutions":[]},
    {"name":"Aceite de coco","unit":"ml","quantity":10,"ingredient_id":"1f3695c6-f396-4b0b-9a78-db954a4597b3","substitutions":[]},
    {"name":"Aceite de sésamo","unit":"ml","quantity":10,"ingredient_id":"bb871f90-1292-400a-bcc6-4538c6bd5067","substitutions":[]},
    {"name":"Aceite de trufa","unit":"ml","quantity":10,"ingredient_id":"35c6f08b-2e8a-43ad-a493-5a8719b4b177","substitutions":[]}
  ]'::jsonb
);

-- R3: A + sal fina + aceite de oliva virgen extra -> 0 extras (los básicos no cuentan).
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009913', 'Arroz con sal y aceite', 'generated', true, 'none',
  '[
    {"name":"Arroz bomba","unit":"g","quantity":200,"ingredient_id":"d77ecb60-f121-4478-8ade-ac6f36d4090b","substitutions":[]},
    {"name":"Sal fina","unit":"pizca","quantity":1,"ingredient_id":"6949a962-3a79-4d2c-bc1b-a6af151ad515","substitutions":[]},
    {"name":"Aceite de oliva virgen extra","unit":"ml","quantity":20,"ingredient_id":"12b92ef3-b7d3-49c3-b0f5-ecfe85cb77ec","substitutions":[]}
  ]'::jsonb
);

-- R4: usa la variante (cebolla morada) de un canónico (cebolla blanca) -> prueba el match canónico.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009914', 'Cebolla morada al horno', 'generated', true, 'none',
  '[
    {"name":"Cebolla morada","unit":"g","quantity":150,"ingredient_id":"aa7746d8-22eb-43af-b9eb-b77dc9d84bb6","substitutions":[]}
  ]'::jsonb
);

-- R5: usa A y contiene gluten -> debe seguir apareciendo, marcada en warnAllergens.
insert into public.recipes (id, title, source, reusable, image_status, ingredients, allergens)
values (
  '00000000-0000-0000-0000-000000009915', 'Arroz con seitan', 'generated', true, 'none',
  '[
    {"name":"Arroz bomba","unit":"g","quantity":200,"ingredient_id":"d77ecb60-f121-4478-8ade-ac6f36d4090b","substitutions":[]}
  ]'::jsonb,
  array['gluten']
);

-- Con [A, B] y p_max_extra=2 (por defecto): R1 (1 extra) entra, R2 (5 extras) no.
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['d77ecb60-f121-4478-8ade-ac6f36d4090b', 'b36fb066-08bf-498a-ad86-00b06406919a']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009911'
  ),
  'Con [A,B] y tope 2: R1 (1 extra) aparece'
);
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['d77ecb60-f121-4478-8ade-ac6f36d4090b', 'b36fb066-08bf-498a-ad86-00b06406919a']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009912'
  ),
  'Con [A,B] y tope 2: R2 (5 extras) NO aparece'
);

-- Con un solo ingrediente [A]: no hay tope de extras, R2 (5 extras) sí aparece.
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['d77ecb60-f121-4478-8ade-ac6f36d4090b']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009912'
  ),
  'Con un solo ingrediente [A]: R2 aparece (sin tope de extras)'
);

-- Con [A]: R3 aparece con extras=0 (sal y aceite no cuentan).
select is(
  (
    select (e.val->>'extras')::int
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['d77ecb60-f121-4478-8ade-ac6f36d4090b']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009913'
  ),
  0,
  'R3 aparece con extras=0 (los básicos no cuentan)'
);

-- Con el id del canónico (cebolla blanca) elegido: R4 (que usa la variante cebolla morada) aparece.
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['30f61048-7900-4403-b0da-a8f7766a0472']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009914'
  ),
  'Con el canónico elegido, la receta que usa la variante aparece (match por canónico)'
);

-- Array vacío -> '[]'.
select is(
  public.discover_recipes_by_ingredients(array[]::uuid[]),
  '[]'::jsonb,
  'Ingredientes vacíos devuelve []'
);

-- Con una necesidad del hogar que mapea a gluten: R5 sigue apareciendo (no filtra), pero avisa.
select set_config(
  'test.discover_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000904'),
  true
);
update public.user_preferences
set special_needs = array['Gluten / celiaquía']
where user_id = '00000000-0000-0000-0000-000000000904';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000904', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['d77ecb60-f121-4478-8ade-ac6f36d4090b']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009915'
  ),
  'R5 (allergens gluten) sigue apareciendo: el descubridor no filtra por alérgenos'
);
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['d77ecb60-f121-4478-8ade-ac6f36d4090b']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009915'
      and e.val->'warnAllergens' ? 'gluten'
  ),
  'R5 trae "gluten" en warnAllergens cuando el hogar lo necesita evitar'
);

select * from finish();
rollback;
