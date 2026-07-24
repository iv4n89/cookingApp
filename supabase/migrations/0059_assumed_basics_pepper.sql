-- Añade la pimienta a los básicos asumidos (no cuentan como faltantes) y sube la versión.
create or replace function public.evaluate_recommendation_snapshot(
  p_snapshot jsonb,
  p_alternative_limit integer default 5
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- El límite público cuenta alternativas; siempre se conserva una principal.
  v_limit integer := greatest(least(coalesce(p_alternative_limit, 5), 40), 0) + 1;
  v_candidates jsonb := '[]'::jsonb;
  v_sorted jsonb := '[]'::jsonb;
  v_ranked jsonb := '[]'::jsonb;
  v_recipe jsonb;
  v_ingredient jsonb;
  v_batch jsonb;
  v_missing jsonb;
  v_used jsonb;
  v_consumed jsonb;
  v_groups jsonb;
  v_group jsonb;
  v_reasons jsonb;
  v_recipe_id text;
  v_canonical_id text;
  v_name text;
  v_required numeric;
  v_unit text;
  v_available numeric;
  v_need numeric;
  v_take numeric;
  v_priority numeric;
  v_consume_soon numeric;
  v_seasonal numeric;
  v_meal numeric;
  v_availability numeric;
  v_missing_count integer;
  v_ingredient_count integer;
  v_ready_count integer;
  v_mode text;
  v_reason text;
  v_active_restrictions boolean;
  v_safety_status text;
  v_confidence text;
  v_season text := p_snapshot->>'season';
  v_meal_type text := p_snapshot->>'mealType';
  v_recipe_safe boolean;
  v_basic boolean;
  v_supported_unit boolean;
  v_matching_batch boolean;
  v_batch_status text;
  v_ord bigint;
  v_value jsonb;
  v_group_unit text;
  v_required_group numeric;
  v_covered_line numeric;
  v_covered_group numeric;
  v_priority_group numeric;
  v_consume_soon_group numeric;
  v_already_consumed numeric;
  v_take_batch numeric;
  v_group_key text;
  v_group_priority numeric;
  v_group_consume_soon numeric;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'recommendation snapshot must be an object'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(p_snapshot->'unsupportedHouseholdNeeds'), 0) > 0
    or coalesce((p_snapshot->>'hasUnsupportedHouseholdNotes')::boolean, false) then
    return jsonb_build_object(
      'policyVersion', 'recommendation-es-v1',
      'evaluatedAt', p_snapshot->>'evaluatedAt',
      'season', v_season,
      'mealType', p_snapshot->'mealType',
      'selectedRecipeId', null,
      'candidates', '[]'::jsonb,
      'decisionReason', 'unsupported_household_restriction',
      'snapshot', p_snapshot
    );
  end if;

  v_active_restrictions :=
    coalesce(jsonb_array_length(p_snapshot->'effectiveAllergens'), 0) > 0
    or coalesce(jsonb_array_length(p_snapshot->'requiredDiet'), 0) > 0;

  for v_recipe in select value from jsonb_array_elements(coalesce(p_snapshot->'recipeInputs', '[]'::jsonb)) loop
    v_recipe_safe := true;
    if v_active_restrictions and jsonb_array_length(coalesce(v_recipe->'ingredients', '[]'::jsonb)) = 0 then
      continue;
    end if;
    if v_active_restrictions and (
      (v_recipe->'allergens') ?| coalesce(array(select jsonb_array_elements_text(p_snapshot->'effectiveAllergens')), '{}')
    ) then
      v_recipe_safe := false;
    end if;
    if not v_recipe_safe then continue; end if;

    v_missing := '[]'::jsonb;
    v_used := '[]'::jsonb;
    v_consumed := '{}'::jsonb;
    v_groups := '{}'::jsonb;
    v_reasons := '[]'::jsonb;
    v_missing_count := 0;
    v_ingredient_count := 0;
    v_ready_count := 0;
    v_availability := 0;
    v_priority := 0;
    v_consume_soon := 0;

    for v_ingredient in select value from jsonb_array_elements(coalesce(v_recipe->'ingredients', '[]'::jsonb)) loop
      v_name := coalesce(v_ingredient->>'name', 'Ingrediente sin nombre');
      v_canonical_id := v_ingredient->>'canonicalIngredientId';
      v_required := nullif(v_ingredient->>'requiredQuantity', '')::numeric;
      v_unit := nullif(v_ingredient->>'unit', '');
      v_basic := lower(btrim(coalesce(v_ingredient->>'canonicalName', ''))) in (
        'sal marina', 'sal gorda', 'sal fina', 'sal de mesa',
        'aceite de oliva virgen extra', 'aceite de oliva suave', 'aceite de girasol',
        'pimienta negra', 'pimienta de sichuan', 'sal y pimienta'
      );

      if v_active_restrictions and (
        v_ingredient->>'safetyCompositionStatus' is distinct from 'exact_reviewed'
        or v_ingredient->'safetyAllergens' is null
        or (v_ingredient->'safetyAllergens') ?| coalesce(array(select jsonb_array_elements_text(p_snapshot->'effectiveAllergens')), '{}')
      ) then
        v_recipe_safe := false;
        exit;
      end if;
      if coalesce(jsonb_array_length(p_snapshot->'requiredDiet'), 0) > 0 and (
        v_ingredient->>'safetyCompositionStatus' is distinct from 'exact_reviewed'
        or v_ingredient->'safetyIncompatibleDiets' is null
        or (v_ingredient->'safetyIncompatibleDiets') ?| coalesce(array(select jsonb_array_elements_text(p_snapshot->'requiredDiet')), '{}')
      ) then
        v_recipe_safe := false;
        exit;
      end if;

      if v_basic then
        continue;
      end if;

      if v_canonical_id is null then
        v_ingredient_count := v_ingredient_count + 1;
        v_missing_count := v_missing_count + 1;
        v_missing := v_missing || jsonb_build_array(jsonb_build_object(
          'ingredientId', v_ingredient->'ingredientId', 'name', v_name,
          'requiredQuantity', v_ingredient->'requiredQuantity', 'unit', v_ingredient->'unit',
          'reason', 'unknown_ingredient'
        ));
        continue;
      end if;

      if v_required is null or v_required < 0 or v_unit is null then
        v_ingredient_count := v_ingredient_count + 1;
        v_missing_count := v_missing_count + 1;
        v_missing := v_missing || jsonb_build_array(jsonb_build_object(
          'ingredientId', v_ingredient->'ingredientId', 'name', v_name,
          'requiredQuantity', v_ingredient->'requiredQuantity', 'unit', v_ingredient->'unit',
          'reason', case when v_required is null then 'insufficient_quantity' else 'unsupported_unit' end
        ));
        continue;
      end if;

      v_group_key := v_canonical_id;
      v_group := v_groups -> v_group_key;
      if v_group is null then
        v_group := jsonb_build_object('unit', v_unit, 'required', 0, 'covered', 0, 'priority', 0, 'consumeSoon', 0);
        v_ingredient_count := v_ingredient_count + 1;
      end if;
      v_group_unit := v_group->>'unit';
      v_required_group := public.convert_inventory_quantity(v_required, v_unit, v_group_unit);
      if v_required_group is null then
        v_group := jsonb_set(v_group, '{covered}', to_jsonb(0::numeric));
        v_groups := jsonb_set(v_groups, array[v_group_key], v_group, true);
        v_missing_count := v_missing_count + 1;
        v_missing := v_missing || jsonb_build_array(jsonb_build_object(
          'ingredientId', v_ingredient->'ingredientId', 'name', v_name,
          'requiredQuantity', v_ingredient->'requiredQuantity', 'unit', v_ingredient->'unit',
          'reason', 'unsupported_unit'
        ));
        continue;
      end if;

      v_need := v_required;
      v_supported_unit := false;
      v_matching_batch := false;
      v_covered_line := 0;
      v_group_priority := 0;
      v_group_consume_soon := 0;
      for v_batch in
        select value from jsonb_array_elements(coalesce(p_snapshot->'inventoryBatches', '[]'::jsonb))
        order by value->>'acquiredAt', value->>'batchId'
      loop
        if v_batch->>'canonicalIngredientId' <> v_canonical_id then continue; end if;
        v_matching_batch := true;
        v_already_consumed := coalesce((v_consumed->>(v_batch->>'batchId'))::numeric, 0);
        v_available := public.convert_inventory_quantity(
          greatest(coalesce((v_batch->>'remainingQuantity')::numeric, 0) - v_already_consumed, 0),
          v_batch->>'unit', v_unit
        );
        if v_available is null then continue; end if;
        v_supported_unit := true;
        if v_need <= 0 then exit; end if;
        v_take := least(v_need, greatest(v_available, 0));
        if v_take > 0 then
          v_take_batch := public.convert_inventory_quantity(v_take, v_unit, v_batch->>'unit');
          v_consumed := jsonb_set(v_consumed, array[v_batch->>'batchId'], to_jsonb(v_already_consumed + v_take_batch), true);
          if not (v_used ? (v_batch->>'batchId')) then
            v_used := v_used || jsonb_build_array(v_batch->>'batchId');
          end if;
          v_batch_status := v_batch->>'expirationStatus';
          v_covered_line := v_covered_line + v_take;
          if v_batch_status = 'priority' then v_group_priority := v_group_priority + v_take; end if;
          if v_batch_status = 'consume_soon' then v_group_consume_soon := v_group_consume_soon + v_take; end if;
          v_need := v_need - v_take;
        end if;
      end loop;

      v_covered_group := public.convert_inventory_quantity(v_covered_line, v_unit, v_group_unit);
      v_priority_group := public.convert_inventory_quantity(v_group_priority, v_unit, v_group_unit);
      v_consume_soon_group := public.convert_inventory_quantity(v_group_consume_soon, v_unit, v_group_unit);
      if v_need <= 0 then
        null;
      else
        v_missing_count := v_missing_count + 1;
        v_reason := case when not v_matching_batch then 'missing' when not v_supported_unit then 'unsupported_unit' else 'insufficient_quantity' end;
        v_missing := v_missing || jsonb_build_array(jsonb_build_object(
          'ingredientId', v_ingredient->'ingredientId', 'name', v_name,
          'requiredQuantity', v_ingredient->'requiredQuantity', 'unit', v_ingredient->'unit',
          'reason', v_reason
        ));
      end if;
      v_group := jsonb_set(v_group, '{covered}', to_jsonb((v_group->>'covered')::numeric + coalesce(v_covered_group, 0)));
      v_group := jsonb_set(v_group, '{required}', to_jsonb((v_group->>'required')::numeric + v_required_group));
      v_group := jsonb_set(v_group, '{priority}', to_jsonb((v_group->>'priority')::numeric + coalesce(v_priority_group, 0)));
      v_group := jsonb_set(v_group, '{consumeSoon}', to_jsonb((v_group->>'consumeSoon')::numeric + coalesce(v_consume_soon_group, 0)));
      v_groups := jsonb_set(v_groups, array[v_group_key], v_group, true);
    end loop;
    if not v_recipe_safe then continue; end if;

    v_ready_count := 0;
    v_priority := 0;
    v_consume_soon := 0;
    for v_group in select value from jsonb_each(v_groups) loop
      if (v_group->>'covered')::numeric >= (v_group->>'required')::numeric then v_ready_count := v_ready_count + 1; end if;
      if (v_group->>'required')::numeric > 0 then
        v_availability := v_availability + least((v_group->>'covered')::numeric / (v_group->>'required')::numeric, 1);
        v_priority := v_priority + least((v_group->>'priority')::numeric / (v_group->>'required')::numeric, 1);
        v_consume_soon := v_consume_soon + least((v_group->>'consumeSoon')::numeric / (v_group->>'required')::numeric, 1);
      end if;
    end loop;
    if v_ingredient_count > 0 then
      v_availability := v_availability / v_ingredient_count;
      v_priority := v_priority / v_ingredient_count;
      v_consume_soon := v_consume_soon / v_ingredient_count;
    end if;

    v_mode := case when v_missing_count = 0 then 'cook_now' else 'shop_then_cook' end;
    v_confidence := v_recipe->>'seasonConfidence';
    v_seasonal := case
      when v_season is not null and (v_recipe->'seasons') ? v_season then
        case v_confidence when 'high' then 1 when 'medium' then 0.75 when 'low' then 0.5 else 0 end
      else 0 end;
    v_meal := case when v_meal_type is not null and (v_recipe->'mealTypes') ? v_meal_type then 1 else 0 end;
    if v_mode = 'cook_now' then v_reasons := v_reasons || jsonb_build_array('ready_from_pantry'); end if;
    if v_priority > 0 then v_reasons := v_reasons || jsonb_build_array('uses_priority_ingredients'); end if;
    if v_consume_soon > 0 then v_reasons := v_reasons || jsonb_build_array('uses_consume_soon_ingredients'); end if;
    if v_seasonal > 0 then v_reasons := v_reasons || jsonb_build_array('seasonal_fit'); end if;
    if v_meal > 0 then v_reasons := v_reasons || jsonb_build_array('meal_type_fit'); end if;
    if v_mode = 'shop_then_cook' then v_reasons := v_reasons || jsonb_build_array('requires_shopping'); end if;
    if v_missing @> '[{"reason":"unknown_ingredient"}]'::jsonb then
      v_reasons := v_reasons || jsonb_build_array('unknown_ingredient');
    end if;
    if v_missing @> '[{"reason":"unsupported_unit"}]'::jsonb then
      v_reasons := v_reasons || jsonb_build_array('unsupported_unit');
    end if;

    v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
      'recipeId', v_recipe->>'recipeId', 'mode', v_mode, 'rank', 0,
      'score', jsonb_build_object(
        'priorityUsage', least(v_priority, 1), 'consumeSoonUsage', least(v_consume_soon, 1),
        'seasonalAffinity', v_seasonal, 'mealTypeMatch', v_meal,
        'availabilityRatio', v_availability, 'missingIngredientCount', v_missing_count
      ),
      'reasonCodes', v_reasons, 'usedBatchIds', v_used, 'missingIngredients', v_missing
    ));
  end loop;

  select coalesce(jsonb_agg(value order by
    ((value->'score'->>'missingIngredientCount')::integer),
    ((value->'score'->>'priorityUsage')::numeric) desc,
    ((value->'score'->>'consumeSoonUsage')::numeric) desc,
    ((value->'score'->>'seasonalAffinity')::numeric) desc,
    ((value->'score'->>'mealTypeMatch')::numeric) desc,
    ((value->'score'->>'availabilityRatio')::numeric) desc,
    value->>'recipeId'
  ), '[]'::jsonb) into v_sorted
  from jsonb_array_elements(v_candidates);

  for v_value, v_ord in select value, ordinality from jsonb_array_elements(v_sorted) with ordinality limit v_limit loop
    v_ranked := v_ranked || jsonb_build_array(jsonb_set(v_value, '{rank}', to_jsonb(v_ord)));
  end loop;

  return jsonb_build_object(
    'policyVersion', 'recommendation-es-v1',
    'evaluatedAt', p_snapshot->>'evaluatedAt',
    'season', v_season,
    'mealType', p_snapshot->'mealType',
    'selectedRecipeId', case when jsonb_array_length(v_ranked) > 0 then v_ranked->0->>'recipeId' else null end,
    'candidates', v_ranked,
    'decisionReason', case
      when jsonb_array_length(v_ranked) = 0 then 'no_safe_candidate'
      when v_ranked->0->>'mode' = 'cook_now' then 'selected_cook_now'
      else 'selected_shop_then_cook' end,
    'snapshot', p_snapshot
  );
end;
$$;
