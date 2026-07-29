begin;

select plan(51);

select has_function('public', 'recommendation_season', array['date'], 'Existe el helper de estación');
select has_function('public', 'evaluate_recommendation_snapshot', array['jsonb', 'integer'], 'Existe el evaluador puro');
select has_function('public', 'build_household_recommendation_snapshot', array['uuid', 'uuid', 'timestamp with time zone', 'text'], 'Existe el constructor privado de snapshot');
select has_function('public', 'household_recommendation_decision', array['text', 'integer'], 'Existe la RPC pública de decisión');
select has_function('public', 'rotation_fraction', array['text', 'text'], 'Existe el helper de rotación');

select ok(
  public.rotation_fraction('semilla-a', 'receta-1') between 0 and 1,
  'La rotación devuelve una fracción entre 0 y 1'
);

select is(
  public.rotation_fraction('semilla-a', 'receta-1'),
  public.rotation_fraction('semilla-a', 'receta-1'),
  'La misma semilla y la misma receta dan siempre el mismo valor'
);

select isnt(
  public.rotation_fraction('semilla-a', 'receta-1'),
  public.rotation_fraction('semilla-b', 'receta-1'),
  'Cambiar de semilla cambia el valor de la misma receta'
);

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
          'ingredientId', 'ingredient-salt', 'canonicalIngredientId', null, 'canonicalName', 'sal marina', 'name', 'Sal marina',
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
            'canonicalName', 'sal marina', 'name', 'Sal marina', 'requiredQuantity', 1, 'unit', 'g',
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

select is(
  public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', jsonb_build_array('nuts'), 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', jsonb_build_array(jsonb_build_object(
        'recipeId', 'uncovered-recipe', 'allergens', null, 'mealTypes', '[]'::jsonb,
        'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', '[]'::jsonb
      ))
    ), 0
  )->>'decisionReason',
  'no_safe_candidate',
  'Una receta sin ingredientes no demuestra seguridad bajo una exclusión activa'
);

select is(
  public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object(
      'batchId', 'duplicate-stock', 'canonicalIngredientId', 'ingredient-duplicate',
      'remainingQuantity', 1, 'unit', 'g', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'fresh'
    )),
    'recipeInputs', jsonb_build_array(jsonb_build_object(
      'recipeId', 'duplicate-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
      'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high',
      'ingredients', jsonb_build_array(
        jsonb_build_object('ingredientId', 'duplicate-a', 'canonicalIngredientId', 'ingredient-duplicate', 'name', 'Ingrediente duplicado', 'requiredQuantity', 1, 'unit', 'g', 'safetyCompositionStatus', 'exact_reviewed', 'safetyAllergens', '[]'::jsonb, 'safetyIncompatibleDiets', '[]'::jsonb),
        jsonb_build_object('ingredientId', 'duplicate-b', 'canonicalIngredientId', 'ingredient-duplicate', 'name', 'Ingrediente duplicado', 'requiredQuantity', 1, 'unit', 'g', 'safetyCompositionStatus', 'exact_reviewed', 'safetyAllergens', '[]'::jsonb, 'safetyIncompatibleDiets', '[]'::jsonb)
      )
    ))
  ), 0)->'candidates'->0->>'mode',
  'shop_then_cook', 'Las líneas duplicadas comparten stock canónico'
);

select is(
  jsonb_array_length(public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object('batchId', 'duplicate-stock-2', 'canonicalIngredientId', 'ingredient-duplicate-2', 'remainingQuantity', 1, 'unit', 'g', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'fresh')),
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'duplicate-recipe-2', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'duplicate-c', 'canonicalIngredientId', 'ingredient-duplicate-2', 'name', 'Duplicado', 'requiredQuantity', 1, 'unit', 'g'), jsonb_build_object('ingredientId', 'duplicate-d', 'canonicalIngredientId', 'ingredient-duplicate-2', 'name', 'Duplicado', 'requiredQuantity', 1, 'unit', 'g'))))
  ), 0)->'candidates'->0->'usedBatchIds'), 1,
  'Los lotes usados no se duplican entre líneas canónicas'
);

select is(
  (public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object('batchId', 'priority-mean', 'canonicalIngredientId', 'ingredient-priority-mean', 'remainingQuantity', 1, 'unit', 'g', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'priority')),
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'mean-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'mean-a', 'canonicalIngredientId', 'ingredient-priority-mean', 'name', 'Prioritario', 'requiredQuantity', 1, 'unit', 'g'), jsonb_build_object('ingredientId', 'mean-b', 'canonicalIngredientId', 'ingredient-missing-mean', 'name', 'Ausente', 'requiredQuantity', 1, 'unit', 'g'))))
  ), 0)->'candidates'->0->'score'->>'priorityUsage')::numeric, 0.5,
  'priorityUsage es la media por ingrediente'
);

select is(
  (public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', '[]'::jsonb,
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'basic-missing', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'salt', 'canonicalIngredientId', null, 'canonicalName', 'sal marina', 'name', 'Sal marina', 'requiredQuantity', 1, 'unit', 'g'), jsonb_build_object('ingredientId', 'missing', 'canonicalIngredientId', 'missing-canonical', 'name', 'Faltante', 'requiredQuantity', 1, 'unit', 'g'))))
  ), 0)->'candidates'->0->'score'->>'availabilityRatio')::numeric, 0::numeric,
  'Los básicos no cuentan en availabilityRatio'
);

select is(
  public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', '[]'::jsonb,
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'known-missing', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'known-missing', 'canonicalIngredientId', 'known-missing', 'name', 'Faltante conocido', 'requiredQuantity', 1, 'unit', 'g'))))
  ), 0)->'candidates'->0->'missingIngredients'->0->>'reason',
  'missing', 'Un ingrediente conocido sin lote se marca como missing'
);

select is(
  public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object('batchId', 'wrong-unit', 'canonicalIngredientId', 'wrong-unit-canonical', 'remainingQuantity', 1, 'unit', 'l', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'fresh')),
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'wrong-unit-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'wrong-unit', 'canonicalIngredientId', 'wrong-unit-canonical', 'name', 'Unidad incompatible', 'requiredQuantity', 1, 'unit', 'g'))))
  ), 0)->'candidates'->0->'missingIngredients'->0->>'reason',
  'unsupported_unit', 'Una unidad incompatible se marca como unsupported_unit'
);

select is(
  public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object('batchId', 'mixed-unit-stock', 'canonicalIngredientId', 'mixed-unit-canonical', 'remainingQuantity', 1, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'fresh')),
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'mixed-unit-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'mixed-a', 'canonicalIngredientId', 'mixed-unit-canonical', 'name', 'Ingrediente mixto', 'requiredQuantity', 100, 'unit', 'g'), jsonb_build_object('ingredientId', 'mixed-b', 'canonicalIngredientId', 'mixed-unit-canonical', 'name', 'Ingrediente mixto', 'requiredQuantity', 0.9, 'unit', 'kg'))))
  ), 0)->'candidates'->0->>'mode',
  'cook_now', 'La cobertura canónica normaliza unidades compatibles'
);

select is(
  public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', '[]'::jsonb,
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'mismatch-basic', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'not-salt', 'canonicalIngredientId', 'not-salt', 'name', 'Sal marina', 'requiredQuantity', 1, 'unit', 'g'))))
  ), 0)->'candidates'->0->>'mode',
  'shop_then_cook', 'El nombre de presentación no puede convertir un ingrediente en básico'
);

select is(
  (public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object('batchId', 'partial-stock', 'canonicalIngredientId', 'partial-canonical', 'remainingQuantity', 0.5, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'fresh')),
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'partial-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'partial', 'canonicalIngredientId', 'partial-canonical', 'name', 'Parcial', 'requiredQuantity', 1, 'unit', 'kg'))))
  ), 0)->'candidates'->0->'score'->>'availabilityRatio')::numeric, 0.5::numeric,
  'La cobertura parcial contribuye a availabilityRatio'
);

select is(
  (public.evaluate_recommendation_snapshot(jsonb_build_object(
    'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
    'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
    'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
    'inventoryBatches', jsonb_build_array(jsonb_build_object('batchId', 'incompatible-duplicate-stock', 'canonicalIngredientId', 'incompatible-duplicate', 'remainingQuantity', 1, 'unit', 'g', 'acquiredAt', '2026-07-01T00:00:00Z', 'expirationStatus', 'fresh')),
    'recipeInputs', jsonb_build_array(jsonb_build_object('recipeId', 'incompatible-duplicate-recipe', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb, 'seasons', jsonb_build_array('all_year'), 'seasonConfidence', 'high', 'ingredients', jsonb_build_array(jsonb_build_object('ingredientId', 'incompatible-a', 'canonicalIngredientId', 'incompatible-duplicate', 'name', 'Mixto incompatible', 'requiredQuantity', 1, 'unit', 'g'), jsonb_build_object('ingredientId', 'incompatible-b', 'canonicalIngredientId', 'incompatible-duplicate', 'name', 'Mixto incompatible', 'requiredQuantity', 1, 'unit', 'ud'))))
  ), 0)->'candidates'->0->'score'->>'availabilityRatio')::numeric, 0::numeric,
  'Una unidad incompatible invalida la cobertura del grupo canónico'
);

select is(
  (public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', '[]'::jsonb,
      'recipeInputs', jsonb_build_array(
        jsonb_build_object(
          'recipeId', 'recipe-buy-two', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-a','canonicalIngredientId',null,'canonicalName','harina','name','Harina','requiredQuantity',1,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-b','canonicalIngredientId',null,'canonicalName','tomate','name','Tomate','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        ),
        jsonb_build_object(
          'recipeId', 'recipe-ready', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-salt','canonicalIngredientId',null,'canonicalName','sal marina','name','Sal marina','requiredQuantity',1,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        )
      )
    ), 5
  )->'candidates'->0->>'recipeId'),
  'recipe-ready',
  'La receta cocinable con básicos (0 faltantes) se ordena antes que la que exige comprar'
);

select is(
  public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', jsonb_build_array(jsonb_build_object(
        'batchId', 'batch-pollo', 'canonicalIngredientId', 'canon-pollo',
        'remainingQuantity', 1, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z',
        'expirationStatus', 'priority'
      )),
      'recipeInputs', jsonb_build_array(
        jsonb_build_object(
          'recipeId', 'recipe-menos-faltantes', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-arroz','canonicalIngredientId','canon-arroz','canonicalName','arroz','name','Arroz','requiredQuantity',200,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        ),
        jsonb_build_object(
          'recipeId', 'recipe-mas-prioritario', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-pollo','canonicalIngredientId','canon-pollo','canonicalName','pollo','name','Pollo','requiredQuantity',500,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-cebolla','canonicalIngredientId','canon-cebolla','canonicalName','cebolla','name','Cebolla','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-ajo','canonicalIngredientId','canon-ajo','canonicalName','ajo','name','Ajo','requiredQuantity',2,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        )
      )
    ), 5
  )->'candidates'->0->>'recipeId',
  'recipe-menos-faltantes',
  'Entre dos recetas shop_then_cook gana la de menos faltantes aunque la otra use más ingredientes prioritarios'
);

select is(
  ((public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', jsonb_build_array(jsonb_build_object(
        'batchId', 'batch-pollo', 'canonicalIngredientId', 'canon-pollo',
        'remainingQuantity', 1, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z',
        'expirationStatus', 'priority'
      )),
      'recipeInputs', jsonb_build_array(
        jsonb_build_object(
          'recipeId', 'recipe-menos-faltantes', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-arroz','canonicalIngredientId','canon-arroz','canonicalName','arroz','name','Arroz','requiredQuantity',200,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        ),
        jsonb_build_object(
          'recipeId', 'recipe-mas-prioritario', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-pollo','canonicalIngredientId','canon-pollo','canonicalName','pollo','name','Pollo','requiredQuantity',500,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-cebolla','canonicalIngredientId','canon-cebolla','canonicalName','cebolla','name','Cebolla','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-ajo','canonicalIngredientId','canon-ajo','canonicalName','ajo','name','Ajo','requiredQuantity',2,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        )
      )
    ), 5
  )->'candidates') @> jsonb_build_array(jsonb_build_object('recipeId', 'recipe-menos-faltantes', 'mode', 'shop_then_cook'))
    and (public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
      'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
      'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
      'inventoryBatches', jsonb_build_array(jsonb_build_object(
        'batchId', 'batch-pollo', 'canonicalIngredientId', 'canon-pollo',
        'remainingQuantity', 1, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z',
        'expirationStatus', 'priority'
      )),
      'recipeInputs', jsonb_build_array(
        jsonb_build_object(
          'recipeId', 'recipe-menos-faltantes', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-arroz','canonicalIngredientId','canon-arroz','canonicalName','arroz','name','Arroz','requiredQuantity',200,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        ),
        jsonb_build_object(
          'recipeId', 'recipe-mas-prioritario', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
          'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
          'ingredients', jsonb_build_array(
            jsonb_build_object('ingredientId','ing-pollo','canonicalIngredientId','canon-pollo','canonicalName','pollo','name','Pollo','requiredQuantity',500,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-cebolla','canonicalIngredientId','canon-cebolla','canonicalName','cebolla','name','Cebolla','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
            jsonb_build_object('ingredientId','ing-ajo','canonicalIngredientId','canon-ajo','canonicalName','ajo','name','Ajo','requiredQuantity',2,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
          )
        )
      )
    ), 5
  )->'candidates') @> jsonb_build_array(jsonb_build_object('recipeId', 'recipe-mas-prioritario', 'mode', 'shop_then_cook'))),
  true,
  'Ambas recetas comparadas son shop_then_cook: la victoria de la menos faltante no depende de un cook_now espurio'
);

select ok(
  (select
    (c -> 'score' ->> 'priorityUsage')::numeric > 0
    and (c -> 'score' ->> 'missingIngredientCount')::int = 2
  from jsonb_array_elements(
    public.evaluate_recommendation_snapshot(
      jsonb_build_object(
        'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
        'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
        'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
        'inventoryBatches', jsonb_build_array(jsonb_build_object(
          'batchId', 'batch-pollo', 'canonicalIngredientId', 'canon-pollo',
          'remainingQuantity', 1, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z',
          'expirationStatus', 'priority'
        )),
        'recipeInputs', jsonb_build_array(
          jsonb_build_object(
            'recipeId', 'recipe-menos-faltantes', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
            'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
            'ingredients', jsonb_build_array(
              jsonb_build_object('ingredientId','ing-arroz','canonicalIngredientId','canon-arroz','canonicalName','arroz','name','Arroz','requiredQuantity',200,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
            )
          ),
          jsonb_build_object(
            'recipeId', 'recipe-mas-prioritario', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
            'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
            'ingredients', jsonb_build_array(
              jsonb_build_object('ingredientId','ing-pollo','canonicalIngredientId','canon-pollo','canonicalName','pollo','name','Pollo','requiredQuantity',500,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
              jsonb_build_object('ingredientId','ing-cebolla','canonicalIngredientId','canon-cebolla','canonicalName','cebolla','name','Cebolla','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
              jsonb_build_object('ingredientId','ing-ajo','canonicalIngredientId','canon-ajo','canonicalName','ajo','name','Ajo','requiredQuantity',2,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
            )
          )
        )
      ), 5
    )->'candidates'
  ) as c
  where c ->> 'recipeId' = 'recipe-mas-prioritario'),
  'La receta con más priorityUsage y más faltantes queda por detrás: priorityUsage > 0 y missingIngredientCount = 2'
);

select is(
  ((select c -> 'score' ->> 'missingIngredientCount'
  from jsonb_array_elements(
    public.evaluate_recommendation_snapshot(
      jsonb_build_object(
        'evaluatedAt', '2026-07-24T10:00:00Z', 'season', 'summer', 'mealType', null,
        'effectiveAllergens', '[]'::jsonb, 'requiredDiet', '[]'::jsonb,
        'unsupportedHouseholdNeeds', '[]'::jsonb, 'hasUnsupportedHouseholdNotes', false,
        'inventoryBatches', jsonb_build_array(jsonb_build_object(
          'batchId', 'batch-pollo', 'canonicalIngredientId', 'canon-pollo',
          'remainingQuantity', 1, 'unit', 'kg', 'acquiredAt', '2026-07-01T00:00:00Z',
          'expirationStatus', 'priority'
        )),
        'recipeInputs', jsonb_build_array(
          jsonb_build_object(
            'recipeId', 'recipe-menos-faltantes', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
            'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
            'ingredients', jsonb_build_array(
              jsonb_build_object('ingredientId','ing-arroz','canonicalIngredientId','canon-arroz','canonicalName','arroz','name','Arroz','requiredQuantity',200,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
            )
          ),
          jsonb_build_object(
            'recipeId', 'recipe-mas-prioritario', 'allergens', '[]'::jsonb, 'mealTypes', '[]'::jsonb,
            'seasons', '[]'::jsonb, 'seasonConfidence', 'low',
            'ingredients', jsonb_build_array(
              jsonb_build_object('ingredientId','ing-pollo','canonicalIngredientId','canon-pollo','canonicalName','pollo','name','Pollo','requiredQuantity',500,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
              jsonb_build_object('ingredientId','ing-cebolla','canonicalIngredientId','canon-cebolla','canonicalName','cebolla','name','Cebolla','requiredQuantity',1,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb),
              jsonb_build_object('ingredientId','ing-ajo','canonicalIngredientId','canon-ajo','canonicalName','ajo','name','Ajo','requiredQuantity',2,'unit','ud','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb)
            )
          )
        )
      ), 5
    )->'candidates'
  ) as c
  where c ->> 'recipeId' = 'recipe-menos-faltantes')::int),
  1,
  'La receta ganadora tiene exactamente 1 faltante frente a los 2 de la alternativa descartada'
);

-- Migración 0059: la pimienta negra se asume básica y no cuenta como faltante.
select is(
  (public.evaluate_recommendation_snapshot(
    jsonb_build_object(
      'evaluatedAt','2026-07-24T10:00:00Z','season','summer','mealType',null,
      'effectiveAllergens','[]'::jsonb,'requiredDiet','[]'::jsonb,
      'unsupportedHouseholdNeeds','[]'::jsonb,'hasUnsupportedHouseholdNotes',false,
      'inventoryBatches','[]'::jsonb,
      'recipeInputs',jsonb_build_array(jsonb_build_object(
        'recipeId','r-pep','allergens','[]'::jsonb,'mealTypes','[]'::jsonb,'seasons','[]'::jsonb,'seasonConfidence','low',
        'ingredients',jsonb_build_array(jsonb_build_object(
          'ingredientId','i-pep','canonicalIngredientId',null,'canonicalName','pimienta negra','name','Pimienta negra',
          'requiredQuantity',1,'unit','g','safetyCompositionStatus','exact_reviewed','safetyAllergens','[]'::jsonb,'safetyIncompatibleDiets','[]'::jsonb))
      ))
    ),5)->'candidates'->0->'score'->>'missingIngredientCount'),
  '0',
  'La pimienta negra se asume básica y no cuenta como faltante'
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
