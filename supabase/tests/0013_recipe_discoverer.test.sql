begin;

select plan(13);

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

-- Ingredientes propios: los ids del catálogo sembrado cambian en cada `db reset`, así que el test
-- crea los suyos. A y B son los elegibles; VAR es variante canónica de HEAD; X1..X5 son extras sin
-- canónico; SALT y OIL cuelgan de un básico asumido para comprobar que no cuentan como extra.
insert into public.ingredients (id, name, normalized_name, category, canonical_id) values
  ('9d15c0e0-0000-4000-8000-000000000001', 'Test A', 'test descubridor a', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000002', 'Test B', 'test descubridor b', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000003', 'Test canónico', 'test descubridor canonico', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000004', 'Test variante', 'test descubridor variante', 'otros',
   '9d15c0e0-0000-4000-8000-000000000003'),
  ('9d15c0e0-0000-4000-8000-000000000011', 'Test extra 1', 'test descubridor extra 1', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000012', 'Test extra 2', 'test descubridor extra 2', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000013', 'Test extra 3', 'test descubridor extra 3', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000014', 'Test extra 4', 'test descubridor extra 4', 'otros', null),
  ('9d15c0e0-0000-4000-8000-000000000015', 'Test extra 5', 'test descubridor extra 5', 'otros', null);

insert into public.ingredients (id, name, normalized_name, category, canonical_id) values
  ('9d15c0e0-0000-4000-8000-000000000021', 'Test sal', 'test descubridor sal', 'otros',
   (select id from public.ingredients where normalized_name = 'sal fina')),
  ('9d15c0e0-0000-4000-8000-000000000022', 'Test aceite', 'test descubridor aceite', 'otros',
   (select id from public.ingredients where normalized_name = 'aceite de oliva virgen extra'));

-- R1: A + B + 1 extra.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009911', 'R1 un extra', 'generated', true, 'none',
  '[
    {"name":"Test A","unit":"g","quantity":200,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000001","substitutions":[]},
    {"name":"Test B","unit":"g","quantity":100,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000002","substitutions":[]},
    {"name":"Test extra 1","unit":"g","quantity":50,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000011","substitutions":[]}
  ]'::jsonb
);

-- R2: A + B + 5 extras.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009912', 'R2 cinco extras', 'generated', true, 'none',
  '[
    {"name":"Test A","unit":"g","quantity":200,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000001","substitutions":[]},
    {"name":"Test B","unit":"g","quantity":100,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000002","substitutions":[]},
    {"name":"Test extra 1","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000011","substitutions":[]},
    {"name":"Test extra 2","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000012","substitutions":[]},
    {"name":"Test extra 3","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000013","substitutions":[]},
    {"name":"Test extra 4","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000014","substitutions":[]},
    {"name":"Test extra 5","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000015","substitutions":[]}
  ]'::jsonb
);

-- R3: A + sal + aceite -> 0 extras (los básicos no cuentan).
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009913', 'R3 solo básicos', 'generated', true, 'none',
  '[
    {"name":"Test A","unit":"g","quantity":200,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000001","substitutions":[]},
    {"name":"Test sal","unit":"pizca","quantity":1,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000021","substitutions":[]},
    {"name":"Test aceite","unit":"ml","quantity":20,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000022","substitutions":[]}
  ]'::jsonb
);

-- R4: usa la variante de un canónico -> prueba el match canónico.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009914', 'R4 variante canónica', 'generated', true, 'none',
  '[
    {"name":"Test variante","unit":"g","quantity":150,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000004","substitutions":[]}
  ]'::jsonb
);

-- R5: usa A y contiene gluten -> debe seguir apareciendo, marcada en warnAllergens.
insert into public.recipes (id, title, source, reusable, image_status, ingredients, allergens)
values (
  '00000000-0000-0000-0000-000000009915', 'R5 con gluten', 'generated', true, 'none',
  '[
    {"name":"Test A","unit":"g","quantity":200,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000001","substitutions":[]}
  ]'::jsonb,
  array['gluten']
);

-- R6: A + B + 3 ingredientes sin ingredient_id (no catalogados).
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009916', 'R6 con desconocidos', 'generated', true, 'none',
  '[
    {"name":"Test A","unit":"g","quantity":200,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000001","substitutions":[]},
    {"name":"Test B","unit":"g","quantity":100,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000002","substitutions":[]},
    {"name":"Alga misteriosa","unit":"g","quantity":10,"ingredient_id":null,"substitutions":[]},
    {"name":"Raíz sin catalogar","unit":"g","quantity":10,"ingredient_id":null,"substitutions":[]},
    {"name":"Especia inventada","unit":"g","quantity":5,"ingredient_id":null,"substitutions":[]}
  ]'::jsonb
);

-- R7: la variante + 5 extras -> comprueba el tope al elegir dos variantes del mismo canónico.
insert into public.recipes (id, title, source, reusable, image_status, ingredients)
values (
  '00000000-0000-0000-0000-000000009917', 'R7 variante con cinco extras', 'generated', true, 'none',
  '[
    {"name":"Test variante","unit":"g","quantity":150,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000004","substitutions":[]},
    {"name":"Test extra 1","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000011","substitutions":[]},
    {"name":"Test extra 2","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000012","substitutions":[]},
    {"name":"Test extra 3","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000013","substitutions":[]},
    {"name":"Test extra 4","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000014","substitutions":[]},
    {"name":"Test extra 5","unit":"g","quantity":10,"ingredient_id":"9d15c0e0-0000-4000-8000-000000000015","substitutions":[]}
  ]'::jsonb
);

-- Con [A, B] y p_max_extra=2 (por defecto): R1 (1 extra) entra, R2 (5 extras) no.
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['9d15c0e0-0000-4000-8000-000000000001', '9d15c0e0-0000-4000-8000-000000000002']::uuid[], 2, 100
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
        array['9d15c0e0-0000-4000-8000-000000000001', '9d15c0e0-0000-4000-8000-000000000002']::uuid[], 2, 100
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
        array['9d15c0e0-0000-4000-8000-000000000001']::uuid[], 2, 100
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
        array['9d15c0e0-0000-4000-8000-000000000001']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009913'
  ),
  0,
  'R3 aparece con extras=0 (los básicos no cuentan)'
);

-- Con el id del canónico elegido: R4 (que usa la variante) aparece.
select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['9d15c0e0-0000-4000-8000-000000000003']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009914'
  ),
  'Con el canónico elegido, la receta que usa la variante aparece (match por canónico)'
);

-- Los ingredientes no catalogados cuentan como extras: con [A,B] y tope 2, R6 (3 extras) no entra.
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['9d15c0e0-0000-4000-8000-000000000001', '9d15c0e0-0000-4000-8000-000000000002']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009916'
  ),
  'Con [A,B] y tope 2: R6 NO aparece (sus ingredientes no catalogados cuentan como extras)'
);
select is(
  (
    select (e.val->>'extras')::int
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['9d15c0e0-0000-4000-8000-000000000001']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009916'
  ),
  4,
  'R6 cuenta los 3 ingredientes sin catalogar y B como extras'
);

-- Elegir dos variantes del mismo canónico son dos elecciones: el tope de extras sigue aplicando.
select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.discover_recipes_by_ingredients(
        array['9d15c0e0-0000-4000-8000-000000000004', '9d15c0e0-0000-4000-8000-000000000003']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009917'
  ),
  'Con dos variantes del mismo canónico elegidas, R7 (5 extras) NO aparece'
);

-- Array vacío -> '[]'.
select is(
  public.discover_recipes_by_ingredients(array[]::uuid[]),
  '[]'::jsonb,
  'Ingredientes vacíos devuelve []'
);

-- Con una necesidad del hogar que mapea a gluten: R5 sigue apareciendo (no filtra), pero avisa.
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
        array['9d15c0e0-0000-4000-8000-000000000001']::uuid[], 2, 100
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
        array['9d15c0e0-0000-4000-8000-000000000001']::uuid[], 2, 100
      )
    ) as e(val)
    where e.val->>'recipeId' = '00000000-0000-0000-0000-000000009915'
      and e.val->'warnAllergens' ? 'gluten'
  ),
  'R5 trae "gluten" en warnAllergens cuando el hogar lo necesita evitar'
);

select * from finish();
rollback;
