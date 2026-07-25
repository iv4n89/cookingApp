begin;

select plan(6);

select has_function(
  'public', 'household_taste_recommendations', array['integer'],
  'Existe la RPC household_taste_recommendations'
);
select ok(
  has_function_privilege('authenticated', 'public.household_taste_recommendations(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.household_taste_recommendations(integer)', 'EXECUTE'),
  'Solo authenticated puede ejecutarla (la llama el móvil con el JWT del usuario)'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000903',
  'authenticated', 'authenticated', 'taste-owner@example.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config(
  'test.taste_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000903'),
  true
);

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values ('00000000-0000-0000-0000-000000000903', '{}', '{}', '');

-- Cuatro recetas reusables con embedding vector(768) explícito para controlar la afinidad
-- (máx coseno contra las recetas semilla del hogar). Vectores deterministas:
--   S y A: casi el mismo vector ('[1,0,0,...]' vs '[0.98,0.02,0,...]') -> coseno alto.
--   B: vector ortogonal ('[0,1,0,...]') -> coseno 0 frente a S.
--   C: mismo vector que S pero con allergens '{gluten}' -> máxima afinidad, debe excluirse
--      por alérgeno cuando el hogar lo marca como necesidad especial.
-- S: semilla, marcada favorita por el usuario.
insert into public.recipes (id, title, source, reusable, image_status, embedding)
values (
  '00000000-0000-0000-0000-000000009901', 'Guiso semilla', 'generated', true, 'none',
  ('[1,' || repeat('0,', 766) || '0]')::vector
);

-- A: catálogo, casi idéntica a S.
insert into public.recipes (id, title, source, reusable, image_status, embedding)
values (
  '00000000-0000-0000-0000-000000009902', 'Guiso muy afín', 'generated', true, 'none',
  ('[0.98,0.02,' || repeat('0,', 765) || '0]')::vector
);

-- B: catálogo, ortogonal a S (afinidad 0).
insert into public.recipes (id, title, source, reusable, image_status, embedding)
values (
  '00000000-0000-0000-0000-000000009903', 'Plato sin relación', 'generated', true, 'none',
  ('[0,1,' || repeat('0,', 765) || '0]')::vector
);

-- C: catálogo, idéntica a S en embedding pero con alérgeno gluten.
insert into public.recipes (id, title, source, reusable, image_status, embedding, allergens)
values (
  '00000000-0000-0000-0000-000000009904', 'Guiso con gluten', 'generated', true, 'none',
  ('[1,' || repeat('0,', 766) || '0]')::vector, array['gluten']
);

insert into public.user_recipes (user_id, recipe_id, is_favorite)
values ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000009901', true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000903', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Con S favorita: A (muy afín) queda antes que B (sin relación) en el carrusel.
-- p_limit alto (1000) para que ambas entren pese al ruido del catálogo real ya
-- sembrado en local (>300 recetas reusable con embedding): el límite por defecto (12)
-- del carrusel podría dejar fuera a B (afinidad exactamente 0) si hay catálogo con
-- afinidad positiva por delante; el orden relativo A-antes-que-B no depende del límite.
select ok(
  (
    select min(idx) from jsonb_array_elements(public.household_taste_recommendations(1000)) with ordinality as t(val, idx)
    where val->>'recipeId' = '00000000-0000-0000-0000-000000009902'
  ) <
  (
    select min(idx) from jsonb_array_elements(public.household_taste_recommendations(1000)) with ordinality as t(val, idx)
    where val->>'recipeId' = '00000000-0000-0000-0000-000000009903'
  ),
  'La receta más afín (A) queda antes que la sin relación (B)'
);

-- La semilla (S) nunca aparece en el carrusel de recomendaciones.
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.household_taste_recommendations(12)) as e(val)
    where val->>'recipeId' = '00000000-0000-0000-0000-000000009901'
  ),
  'La semilla S no aparece en el resultado'
);

-- El hogar marca 'Gluten / celiaquía' (need_allergen_map -> allergen 'gluten'): C queda excluida.
update public.user_preferences
set special_needs = array['Gluten / celiaquía']
where user_id = '00000000-0000-0000-0000-000000000903';

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.household_taste_recommendations(12)) as e(val)
    where val->>'recipeId' = '00000000-0000-0000-0000-000000009904'
  ),
  'C (allergens gluten) se excluye cuando el hogar necesita evitarlo'
);

-- Sin semillas (se retira el favorito de S): el carrusel queda vacío.
update public.user_recipes
set is_favorite = false
where user_id = '00000000-0000-0000-0000-000000000903'
  and recipe_id = '00000000-0000-0000-0000-000000009901';

select is(
  public.household_taste_recommendations(12),
  '[]'::jsonb,
  'Sin recetas semilla (favoritas o valoradas >=4) el carrusel devuelve []'
);

select * from finish();
rollback;
