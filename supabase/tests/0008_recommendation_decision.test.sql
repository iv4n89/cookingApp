begin;

select plan(30);

select has_function('public', 'recommendation_season', array['date'], 'Existe el helper de estación');
select has_function('public', 'evaluate_recommendation_snapshot', array['jsonb', 'integer'], 'Existe el evaluador puro');
select has_function('public', 'build_household_recommendation_snapshot', array['uuid', 'uuid', 'timestamp with time zone', 'text'], 'Existe el constructor privado de snapshot');
select has_function('public', 'household_recommendation_decision', array['text', 'integer'], 'Existe la RPC pública de decisión');

select is(public.recommendation_season('2026-03-01'::date), 'spring', 'Marzo inicia primavera');
select is(public.recommendation_season('2026-05-31'::date), 'spring', 'Mayo permanece en primavera');
select is(public.recommendation_season('2026-06-01'::date), 'summer', 'Junio inicia verano');
select is(public.recommendation_season('2026-08-31'::date), 'summer', 'Agosto permanece en verano');
select is(public.recommendation_season('2026-09-01'::date), 'autumn', 'Septiembre inicia otoño');
select is(public.recommendation_season('2026-12-01'::date), 'winter', 'Diciembre inicia invierno');
select is(public.recommendation_season('2026-02-28'::date), 'winter', 'Febrero permanece en invierno');

select is(
  public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', 'cena',
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', jsonb_build_array(jsonb_build_object(
        'recipeId', 'recipe-cook', 'allergens', '[]'::jsonb, 'mealTypes', jsonb_build_array('cena'),
        'seasons', jsonb_build_array('summer'), 'seasonConfidence', 'high',
        'ingredients', jsonb_build_array(jsonb_build_object(
          'ingredientId', 'ingredient-salt', 'canonicalIngredientId', null, 'name', 'Sal marina',
          'requiredQuantity', 1, 'unit', 'g', 'safetyCompositionStatus', 'exact_reviewed',
          'safetyAllergens', '[]'::jsonb, 'safetyIncompatibleDiets', '[]'::jsonb
        ))
      ))
    ), 5
  )->>'decisionReason',
  'selected_cook_now',
  'Los básicos asumidos permiten cocinar ahora'
);

select is(
  (public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', jsonb_build_array('Halal'), 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb, 'recipeInputs', '[]'::jsonb
    ), 5
  )->>'decisionReason'),
  'unsupported_household_restriction',
  'Una necesidad no soportada falla cerrado'
);

select is(
  jsonb_array_length(public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', jsonb_build_array(
        jsonb_build_object('recipeId', 'a', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', '[]'::jsonb),
        jsonb_build_object('recipeId', 'b', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('winter'), 'seasonConfidence', 'high', 'ingredients', '[]'::jsonb)
      )
    ), 1
  )->'candidates'),
  2,
  'El límite de una alternativa devuelve principal más alternativa'
);

select is(
  public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', jsonb_build_array(jsonb_build_object(
        'batchId', 'priority-batch', 'canonicalIngredientId', 'ingredient-priority',
        'remainingQuantity', 1, 'unit', 'ud', 'acquiredAt', '2026-07-01T00:00:00Z',
        'expirationStatus', 'priority'
      )),
      'recipeInputs', jsonb_build_array(
        jsonb_build_object(
          'recipeId', 'priority-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', jsonb_build_array('winter'), 'seasonConfidence', 'high',
          'ingredients', jsonb_build_array(jsonb_build_object(
            'ingredientId', 'ingredient-priority', 'canonicalIngredientId', 'ingredient-priority',
            'name', 'Ingrediente prioritario', 'requiredQuantity', 1, 'unit', 'ud',
            'safetyCompositionStatus', 'exact_reviewed', 'safetyAllergens', '[]'::jsonb,
            'safetyIncompatibleDiets', '[]'::jsonb
          ))
        ),
        jsonb_build_object(
          'recipeId', 'seasonal-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', jsonb_build_array('summer'), 'seasonConfidence', 'high',
          'ingredients', jsonb_build_array(jsonb_build_object(
            'ingredientId', 'ingredient-salt', 'canonicalIngredientId', null,
            'name', 'Sal marina', 'requiredQuantity', 1, 'unit', 'g',
            'safetyCompositionStatus', 'exact_reviewed', 'safetyAllergens', '[]'::jsonb,
            'safetyIncompatibleDiets', '[]'::jsonb
          ))
        )
      )
    ), 0
  )->>'selectedRecipeId',
  'priority-recipe',
  'El aprovechamiento prioritario domina la afinidad estacional'
);

select ok(
  not has_function_privilege('anon', 'public.recommendation_season(date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.recommendation_season(date)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.evaluate_recommendation_snapshot(jsonb,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.evaluate_recommendation_snapshot(jsonb,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.build_household_recommendation_snapshot(uuid,uuid,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.build_household_recommendation_snapshot(uuid,uuid,timestamptz,text)', 'EXECUTE'),
  'Los helpers no son invocables por clientes'
);

select throws_ok(
  $$ select public.build_household_recommendation_snapshot(null, null, null, null) $$,
  '22023',
  'recommendation snapshot requires household, user and evaluation time',
  'El snapshot exige identidad, hogar y reloj explícitos'
);

select ok(
  has_function_privilege('authenticated', 'public.household_recommendation_decision(text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.household_recommendation_decision(text,integer)', 'EXECUTE'),
  'Solo authenticated puede ejecutar la RPC pública'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000701',
    'authenticated', 'authenticated', 'recommend-owner@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000702',
    'authenticated', 'authenticated', 'recommend-member@example.test', 'not-used', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

select set_config(
  'test.recommend_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000701'),
  true
);

delete from public.households
where owner_user_id = '00000000-0000-0000-0000-000000000702';

insert into public.household_members (household_id, user_id, role)
values (current_setting('test.recommend_household')::uuid, '00000000-0000-0000-0000-000000000702', 'member');

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values
  ('00000000-0000-0000-0000-000000000701', '{}', array['Frutos secos'], ''),
  ('00000000-0000-0000-0000-000000000702', '{}', '{}', 'nota clínica no estructurada');

insert into public.pantry_items (
  id, user_id, household_id, ingredient_id, name, quantity, unit, category
) values (
  '00000000-0000-0000-0000-000000007101',
  '00000000-0000-0000-0000-000000000701',
  current_setting('test.recommend_household')::uuid,
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 2, 'ud', 'Frutas'
);

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at
) values (
  '00000000-0000-0000-0000-000000007201',
  current_setting('test.recommend_household')::uuid,
  '00000000-0000-0000-0000-000000007101',
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 'Frutas', 'ud', 2, 2, 'manual', '2026-07-23T10:00:00Z'
);

insert into public.recipes (id, title, source, reusable, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000007301', 'Receta snapshot recommendation', 'generated', true,
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'manzana golden'),
    'name', 'Manzana golden', 'quantity', 1, 'unit', 'ud'
  )), array['cena']
);

do $$
begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000007301', array['summer'], 'high', 'curated', 'test-v1'
  );
end;
$$;

select ok(
  (public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->>'householdId') = current_setting('test.recommend_household'),
  'El snapshot queda ligado al hogar solicitado'
);

select is(
  public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->'effectiveAllergens',
  '["nuts"]'::jsonb,
  'Las necesidades estructuradas se convierten en alérgenos efectivos'
);

select is(
  public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->'unsupportedHouseholdNeeds',
  '[]'::jsonb,
  'No se inventan necesidades no declaradas'
);

select ok(
  (public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->>'hasUnsupportedHouseholdNotes')::boolean,
  'Las notas libres activan el fallo cerrado sin exponerse'
);

select is(
  jsonb_array_length(public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->'inventoryBatches'),
  1,
  'El snapshot incluye los lotes positivos del hogar'
);

select ok(
  (public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->'recipeInputs') @> jsonb_build_array(jsonb_build_object('recipeId', '00000000-0000-0000-0000-000000007301')),
  'El snapshot incluye recetas reutilizables'
);

select is(
  (public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->>'season'),
  'summer',
  'La fecha explícita deriva verano para España'
);

select is(
  (public.build_household_recommendation_snapshot(
    current_setting('test.recommend_household')::uuid,
    '00000000-0000-0000-0000-000000000701',
    '2026-07-24T10:00:00Z', 'cena'
  )->'recipeInputs'->0->'ingredients'->0->>'safetyProfileVersion'),
  'ingredient-allergens-es-v1',
  'El snapshot conserva la versión del perfil de seguridad exacto'
);

update public.user_preferences
set notes = ''
where user_id = '00000000-0000-0000-0000-000000000702';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.household_recommendation_decision('cena', 5)->>'decisionReason',
  'selected_cook_now',
  'La RPC pública selecciona una receta cocinable'
);

select is(
  public.household_recommendation_decision('cena', 5)->>'selectedRecipeId',
  '00000000-0000-0000-0000-000000007301',
  'La RPC devuelve la receta principal determinista'
);

select is(
  (select remaining_quantity from public.pantry_batches where id = '00000000-0000-0000-0000-000000007201'),
  2::numeric,
  'La recomendación no muta el inventario'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);

select is(
  public.household_recommendation_decision('cena', 5)->>'selectedRecipeId',
  '00000000-0000-0000-0000-000000007301',
  'Otro miembro comparte la decisión del inventario del hogar'
);

select * from finish();
rollback;
