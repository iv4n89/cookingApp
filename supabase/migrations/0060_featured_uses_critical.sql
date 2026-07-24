-- household_today_decision v4: la destacada de pantry aprovecha un ingrediente crítico
-- (priority/consume_soon) si existe una candidata de la franja que lo usa con <=2 faltantes;
-- si no, se mantiene la de menos faltantes. Alternativas y discover como antes.

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
  v_meal jsonb;           -- candidatas de la franja con {rk, recipeId, missing, prio, card}
  v_featured_id text;
  v_featured jsonb;
  v_alternatives jsonb;
  v_discover jsonb;
  v_pantry_ids text[] := '{}';
  v_alt_count integer := 4;  -- alternativas mostradas bajo la destacada
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

  -- Candidatas de la franja actual (o sin meal_types), con lo necesario para elegir destacada.
  select coalesce(jsonb_agg(
    jsonb_build_object('rk', rk, 'recipeId', recipe_id, 'missing', missing, 'prio', prio, 'card', card)
    order by rk
  ), '[]'::jsonb)
  into v_meal
  from (
    select
      (candidate->>'rank')::int as rk,
      candidate->>'recipeId' as recipe_id,
      coalesce((candidate->'score'->>'missingIngredientCount')::int, 0) as missing,
      coalesce((candidate->'score'->>'priorityUsage')::numeric, 0) as prio,
      jsonb_build_object(
        'recipeId', candidate->>'recipeId', 'title', r.title,
        'imageUrl', r.image_url, 'imageStatus', r.image_status,
        'mode', candidate->>'mode',
        'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
        'reasons', candidate->'reasonCodes'
      ) as card
    from jsonb_array_elements(v_decision->'candidates') as candidate
    join public.recipes r on r.id = (candidate->>'recipeId')::uuid
    where p_meal_type is null
       or r.meal_types is null
       or cardinality(r.meal_types) = 0
       or r.meal_types @> array[p_meal_type]
  ) c;

  -- Fallback: si la franja no deja candidatas, usa todas (sin filtro).
  if jsonb_array_length(v_meal) = 0 then
    select coalesce(jsonb_agg(
      jsonb_build_object('rk', rk, 'recipeId', recipe_id, 'missing', missing, 'prio', prio, 'card', card)
      order by rk
    ), '[]'::jsonb)
    into v_meal
    from (
      select
        (candidate->>'rank')::int as rk,
        candidate->>'recipeId' as recipe_id,
        coalesce((candidate->'score'->>'missingIngredientCount')::int, 0) as missing,
        coalesce((candidate->'score'->>'priorityUsage')::numeric, 0) as prio,
        jsonb_build_object(
          'recipeId', candidate->>'recipeId', 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status,
          'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card
      from jsonb_array_elements(v_decision->'candidates') as candidate
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
    ) c;
  end if;

  -- Destacada: si hay una candidata que aprovecha lo crítico (prio > 0) con <= 2 faltantes,
  -- gana esa (menos faltantes primero, luego más uso crítico); si no, la de menos faltantes.
  select elem->>'recipeId'
  into v_featured_id
  from jsonb_array_elements(v_meal) elem
  where (elem->>'prio')::numeric > 0 and (elem->>'missing')::int <= 2
  order by (elem->>'missing')::int asc, (elem->>'prio')::numeric desc, (elem->>'rk')::int asc
  limit 1;

  if v_featured_id is null then
    select elem->>'recipeId'
    into v_featured_id
    from jsonb_array_elements(v_meal) elem
    order by (elem->>'rk')::int asc
    limit 1;
  end if;

  -- Tarjeta de la destacada y alternativas (resto de la franja por rango, sin la destacada).
  if v_featured_id is not null then
    select elem->'card'
    into v_featured
    from jsonb_array_elements(v_meal) elem
    where elem->>'recipeId' = v_featured_id
    limit 1;

    select coalesce(jsonb_agg(card order by rk), '[]'::jsonb)
    into v_alternatives
    from (
      select (elem->>'rk')::int as rk, elem->'card' as card
      from jsonb_array_elements(v_meal) elem
      where elem->>'recipeId' <> v_featured_id
      order by (elem->>'rk')::int
      limit v_alt_count
    ) a;

    select array_agg(id) into v_pantry_ids
    from (
      select v_featured_id as id
      union all
      select elem->>'recipeId' from jsonb_array_elements(v_alternatives) elem
    ) ids;
  else
    v_featured := null;
    v_alternatives := '[]'::jsonb;
    v_pantry_ids := '{}';
  end if;

  -- Pista discover: candidatas que NO están en pantry, una por tipo de cocina, hasta 5.
  select coalesce(jsonb_agg(card order by rk), '[]'::jsonb)
  into v_discover
  from (
    select rk, card
    from (
      select distinct on (r.tags[1])
        (candidate->>'rank')::int as rk,
        jsonb_build_object(
          'recipeId', candidate->>'recipeId', 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status,
          'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card
      from jsonb_array_elements(v_decision->'candidates') as candidate
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
      where not ((candidate->>'recipeId') = any(v_pantry_ids))
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
    'pantry', jsonb_build_object('featured', v_featured, 'alternatives', coalesce(v_alternatives, '[]'::jsonb)),
    'discover', coalesce(v_discover, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.household_today_decision(text, integer) from public, anon;
grant execute on function public.household_today_decision(text, integer) to authenticated;
