begin;

select plan(11);

select has_view('public', 'ingredient_recipe_coverage', 'Existe la vista de cobertura');

select ok(
  has_table_privilege('service_role', 'public.ingredient_recipe_coverage', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ingredient_recipe_coverage', 'SELECT')
  and not has_table_privilege('anon', 'public.ingredient_recipe_coverage', 'SELECT'),
  'Solo service_role puede leerla: no es dato de usuario y no la consume el móvil'
);

-- Ingredientes propios: los ids del catálogo sembrado cambian en cada `db reset`, así que el
-- test crea los suyos. CAN_* son canónicos; VAR_* cuelgan de uno.
insert into public.ingredients (id, name, normalized_name, category, canonical_id) values
  ('c0ffee00-0000-4000-8000-000000000001', 'Cobertura A', 'cobertura a', 'verduras', null),
  ('c0ffee00-0000-4000-8000-000000000002', 'Cobertura A variante', 'cobertura a variante', 'verduras',
   'c0ffee00-0000-4000-8000-000000000001'),
  ('c0ffee00-0000-4000-8000-000000000003', 'Cobertura B', 'cobertura b', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000004', 'Cobertura C', 'cobertura c', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000005', 'Cobertura D', 'cobertura d', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000006', 'Cobertura E', 'cobertura e', 'otros', null),
  ('c0ffee00-0000-4000-8000-000000000007', 'Cobertura E variante', 'cobertura e variante', 'otros',
   'c0ffee00-0000-4000-8000-000000000006');

-- R1: A + B. R2: B. R3: solo la variante de A. R4: D, no reusable. R5: una fila sin enlazar.
-- R6: E y su variante en la misma receta.
insert into public.recipes (id, title, source, reusable, image_status, ingredients) values
  (
    'c0ffee00-0000-4000-8000-000000009801', 'Cobertura R1', 'generated', true, 'none',
    '[
      {"name":"Cobertura A","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000001","substitutions":[]},
      {"name":"Cobertura B","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000003","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009802', 'Cobertura R2', 'generated', true, 'none',
    '[
      {"name":"Cobertura B","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000003","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009803', 'Cobertura R3', 'generated', true, 'none',
    '[
      {"name":"Cobertura A variante","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000002","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009804', 'Cobertura R4', 'generated', false, 'none',
    '[
      {"name":"Cobertura D","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000005","substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009805', 'Cobertura R5', 'generated', true, 'none',
    '[
      {"name":"Ingrediente que el resolver no supo enlazar","unit":"g","quantity":100,"substitutions":[]}
    ]'::jsonb
  ),
  (
    'c0ffee00-0000-4000-8000-000000009806', 'Cobertura R6', 'generated', true, 'none',
    '[
      {"name":"Cobertura E","unit":"g","quantity":100,"ingredient_id":"c0ffee00-0000-4000-8000-000000000006","substitutions":[]},
      {"name":"Cobertura E variante","unit":"g","quantity":50,"ingredient_id":"c0ffee00-0000-4000-8000-000000000007","substitutions":[]}
    ]'::jsonb
  );

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000003'),
  2::bigint,
  'Un ingrediente que usan dos recetas cuenta dos'
);

select is(
  (select count(*) from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000002'),
  0::bigint,
  'Una variante no tiene fila propia: la cobertura es del canónico'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000001'),
  2::bigint,
  'La receta que solo usa la variante suma al canónico'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000006'),
  1::bigint,
  'Una receta que menciona dos variantes del mismo canónico cuenta una vez, no dos'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000004'),
  0::bigint,
  'Un ingrediente sin ninguna receta aparece con cero, no desaparece'
);

select is(
  (select recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000005'),
  1::bigint,
  'Una receta no reusable suma en recipe_count'
);

select is(
  (select reusable_recipe_count from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000005'),
  0::bigint,
  'Una receta no reusable no suma en reusable_recipe_count: no llegará a la Home de nadie'
);

select is(
  (select count(*) from public.ingredient_recipe_coverage),
  (select count(*) from public.ingredients where canonical_id is null),
  'Una fila por canónico: la receta con un ingrediente sin enlazar no añade ninguna'
);

select is(
  (select category from public.ingredient_recipe_coverage
   where ingredient_id = 'c0ffee00-0000-4000-8000-000000000001'),
  'verduras',
  'La categoría del canónico sale en la vista, para atacar familias enteras de huecos'
);

select * from finish();
rollback;
