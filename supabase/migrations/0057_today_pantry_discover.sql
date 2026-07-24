-- household_today_decision v2: reparte las candidatas seguras del motor en dos pistas
-- (pantry = menos faltantes; discover = variedad por cocina) y expone los productos prioritarios.

create or replace function public.household_today_decision(
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
  v_discover jsonb;
  v_pantry_count integer := 5;  -- featured + 4 alternativas
begin
  -- Pide un conjunto amplio de candidatas seguras (ya ordenadas por menos faltantes).
  v_decision := public.household_recommendation_decision(p_meal_type, 30);

  -- Productos prioritarios: priority antes que consume_soon, luego más antiguos primero.
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

  -- Tarjeta de pintado por candidata, conservando rango (orden = menos faltantes primero).
  select coalesce(jsonb_agg(card order by rk), '[]'::jsonb)
  into v_cards
  from (
    select
      (candidate->>'rank')::int as rk,
      jsonb_build_object(
        'recipeId', candidate->>'recipeId',
        'title', r.title,
        'imageUrl', r.image_url,
        'imageStatus', r.image_status,
        'mode', candidate->>'mode',
        'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
        'reasons', candidate->'reasonCodes'
      ) as card
    from jsonb_array_elements(v_decision->'candidates') as candidate
    join public.recipes r on r.id = (candidate->>'recipeId')::uuid
  ) c;

  -- Pista pantry: las primeras (menos faltantes).
  v_featured := v_cards->0;
  v_alternatives := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_cards) with ordinality
    where ordinality > 1 and ordinality <= v_pantry_count
  ), '[]'::jsonb);

  -- Pista discover: del resto, una por tipo de cocina (primer tag), hasta 5, por rango.
  -- Anidado: (1) una por cocina, (2) ordenar por rango y limitar a 5, (3) agregar.
  select coalesce(jsonb_agg(card order by rk), '[]'::jsonb)
  into v_discover
  from (
    select rk, card
    from (
      select distinct on (r.tags[1])
        (candidate->>'rank')::int as rk,
        jsonb_build_object(
          'recipeId', candidate->>'recipeId',
          'title', r.title,
          'imageUrl', r.image_url,
          'imageStatus', r.image_status,
          'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card
      from jsonb_array_elements(v_decision->'candidates') with ordinality as c(candidate, ord)
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
      where ord > v_pantry_count
      order by r.tags[1], (candidate->>'rank')::int
    ) per_cuisine
    order by rk
    limit 5
  ) picked;

  return jsonb_build_object(
    'policyVersion', v_decision->>'policyVersion',
    'mealType', v_decision->'mealType',
    'decisionReason', v_decision->>'decisionReason',
    'priorityProducts', coalesce(v_priority, '[]'::jsonb),
    'pantry', jsonb_build_object('featured', v_featured, 'alternatives', v_alternatives),
    'discover', coalesce(v_discover, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.household_today_decision(text, integer) from public, anon;
grant execute on function public.household_today_decision(text, integer) to authenticated;
