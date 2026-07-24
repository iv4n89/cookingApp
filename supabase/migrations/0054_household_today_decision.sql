-- Compositor de la "decisión de hoy": une decisión determinista, caducidad y datos de pintado.
-- No duplica lógica: delega en household_recommendation_decision y household_expiration_snapshot.

create function public.household_today_decision(
  p_meal_type text default null,
  p_alternative_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decision jsonb;
  v_priority jsonb;
  v_cards jsonb;
  v_featured jsonb;
  v_alternatives jsonb;
  v_shopping jsonb;
begin
  -- 1) Decisión determinista (valida auth/hogar internamente y lanza si falla).
  v_decision := public.household_recommendation_decision(p_meal_type, p_alternative_limit);

  -- 2) Productos prioritarios: priority antes que consume_soon, luego más antiguos primero.
  select coalesce(jsonb_agg(product order by rank_key, age_days desc), '[]'::jsonb)
  into v_priority
  from (
    select
      jsonb_build_object(
        'name', s.ingredient_name,
        'status', s.status,
        'estimatedDate', case
          when s.acquired_at is not null and s.min_days is not null
          then (s.acquired_at + make_interval(days => s.min_days))
          else null
        end,
        'confidence', s.confidence
      ) as product,
      case s.status when 'priority' then 0 when 'consume_soon' then 1 else 2 end as rank_key,
      s.age_days
    from public.household_expiration_snapshot() s
    where s.status in ('priority', 'consume_soon')
  ) ranked;

  -- 3) Tarjetas de receta: une cada candidata con su fila de recipes para el pintado.
  select coalesce(jsonb_agg(card order by (candidate->>'rank')::int), '[]'::jsonb)
  into v_cards
  from jsonb_array_elements(v_decision->'candidates') as candidate
  join public.recipes r on r.id = (candidate->>'recipeId')::uuid
  cross join lateral jsonb_build_object(
    'recipeId', candidate->>'recipeId',
    'title', r.title,
    'imageUrl', r.image_url,
    'imageStatus', r.image_status,
    'mode', candidate->>'mode',
    'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
    'reasons', candidate->'reasonCodes'
  ) as card;

  v_featured := v_cards->0;
  v_alternatives := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_cards) with ordinality
    where ordinality > 1
  ), '[]'::jsonb);

  -- 4) Compra: faltantes de las candidatas shop_then_cook, deduplicados por nombre.
  select coalesce(jsonb_agg(distinct_item order by distinct_item->>'name'), '[]'::jsonb)
  into v_shopping
  from (
    select distinct on (lower(missing->>'name'))
      jsonb_build_object(
        'ingredientId', missing->'ingredientId',
        'name', missing->>'name',
        'quantity', missing->'requiredQuantity',
        'unit', missing->>'unit'
      ) as distinct_item
    from jsonb_array_elements(v_decision->'candidates') as candidate
    cross join jsonb_array_elements(candidate->'missingIngredients') as missing
    where candidate->>'mode' = 'shop_then_cook'
    order by lower(missing->>'name')
  ) deduped;

  return jsonb_build_object(
    'policyVersion', v_decision->>'policyVersion',
    'mealType', v_decision->'mealType',
    'decisionReason', v_decision->>'decisionReason',
    'priorityProducts', coalesce(v_priority, '[]'::jsonb),
    'featured', v_featured,
    'alternatives', v_alternatives,
    'shoppingMissing', coalesce(v_shopping, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.household_today_decision(text, integer) from public, anon;
grant execute on function public.household_today_decision(text, integer) to authenticated;
