-- household_today_decision v7: cada producto prioritario viaja con su ingrediente canónico para
-- que el Home pueda abrir el descubridor con ese ingrediente ya elegido. Es el mismo id que espera
-- discover_recipes_by_ingredients, que también resuelve al canónico. El resto de la decisión
-- (pantry y discover con lean por gusto) es igual que en v6.

create or replace function public.household_today_decision(
  p_meal_type text default null,
  p_alternative_limit integer default 5
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_decision jsonb;
  v_priority jsonb;
  v_meal jsonb;
  v_featured_id text;
  v_featured jsonb;
  v_alternatives jsonb;
  v_discover jsonb;
  v_pantry_ids text[] := '{}';
  v_alt_count integer := 4;
begin
  v_decision := public.household_recommendation_decision(p_meal_type, 30);

  -- Productos prioritarios: priority antes que consume_soon, luego más antiguos primero.
  select coalesce(jsonb_agg(product order by rank_key, age_days desc), '[]'::jsonb)
  into v_priority
  from (
    select
      jsonb_build_object(
        'name', s.ingredient_name, 'status', s.status,
        'canonicalIngredientId', s.canonical_ingredient_id,
        'estimatedDate', case when s.acquired_at is not null and s.min_days is not null
          then (s.acquired_at + make_interval(days => s.min_days)) else null end,
        'confidence', s.confidence
      ) as product,
      case s.status when 'priority' then 0 when 'consume_soon' then 1 else 2 end as rank_key,
      s.age_days
    from public.household_expiration_snapshot() s
    where s.status in ('priority', 'consume_soon')
  ) ranked;

  -- Candidatas de la franja, barajadas dentro de cada nivel de faltantes (menos faltantes primero).
  select coalesce(jsonb_agg(
    jsonb_build_object('recipeId', recipe_id, 'missing', missing, 'prio', prio, 'card', card)
    order by missing, random()
  ), '[]'::jsonb)
  into v_meal
  from (
    select
      candidate->>'recipeId' as recipe_id,
      coalesce((candidate->'score'->>'missingIngredientCount')::int, 0) as missing,
      coalesce((candidate->'score'->>'priorityUsage')::numeric, 0) as prio,
      jsonb_build_object(
        'recipeId', candidate->>'recipeId', 'title', r.title,
        'imageUrl', r.image_url, 'imageStatus', r.image_status, 'mode', candidate->>'mode',
        'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
        'reasons', candidate->'reasonCodes'
      ) as card
    from jsonb_array_elements(v_decision->'candidates') as candidate
    join public.recipes r on r.id = (candidate->>'recipeId')::uuid
    where p_meal_type is null or r.meal_types is null
       or cardinality(r.meal_types) = 0 or r.meal_types @> array[p_meal_type]
  ) c;

  -- Fallback: si la franja no deja candidatas, usa todas (sin filtro), también barajado.
  if jsonb_array_length(v_meal) = 0 then
    select coalesce(jsonb_agg(
      jsonb_build_object('recipeId', recipe_id, 'missing', missing, 'prio', prio, 'card', card)
      order by missing, random()
    ), '[]'::jsonb)
    into v_meal
    from (
      select
        candidate->>'recipeId' as recipe_id,
        coalesce((candidate->'score'->>'missingIngredientCount')::int, 0) as missing,
        coalesce((candidate->'score'->>'priorityUsage')::numeric, 0) as prio,
        jsonb_build_object(
          'recipeId', candidate->>'recipeId', 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status, 'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card
      from jsonb_array_elements(v_decision->'candidates') as candidate
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
    ) c;
  end if;

  -- Destacada: si hay candidata que aprovecha lo crítico (prio>0) con <=2 faltantes, gana esa
  -- (menos faltantes, luego más uso crítico, y aleatorio entre iguales); si no, la primera del
  -- orden barajado (menos faltantes, aleatorio entre iguales).
  select elem->>'recipeId'
  into v_featured_id
  from jsonb_array_elements(v_meal) elem
  where (elem->>'prio')::numeric > 0 and (elem->>'missing')::int <= 2
  order by (elem->>'missing')::int asc, (elem->>'prio')::numeric desc, random()
  limit 1;

  if v_featured_id is null then
    v_featured_id := v_meal->0->>'recipeId';
  end if;

  if v_featured_id is not null then
    select elem->'card' into v_featured
    from jsonb_array_elements(v_meal) elem where elem->>'recipeId' = v_featured_id limit 1;

    select coalesce(jsonb_agg(card order by ord), '[]'::jsonb)
    into v_alternatives
    from (
      select ord, elem->'card' as card
      from jsonb_array_elements(v_meal) with ordinality as e(elem, ord)
      where elem->>'recipeId' <> v_featured_id
      order by ord
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

  -- Discover: una por tipo de cocina, con azar ponderado por gusto (tira hacia el estilo del hogar
  -- sin perder variedad), 5 al azar ponderado, sin las de pantry.
  select coalesce(jsonb_agg(card), '[]'::jsonb)
  into v_discover
  from (
    select card
    from (
      select distinct on (r.tags[1])
        jsonb_build_object(
          'recipeId', candidate->>'recipeId', 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status, 'mode', candidate->>'mode',
          'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
          'reasons', candidate->'reasonCodes'
        ) as card,
        (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0) + 0.5 * random()) as weight
      from jsonb_array_elements(v_decision->'candidates') as candidate
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
      where not ((candidate->>'recipeId') = any(v_pantry_ids))
      order by r.tags[1], (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0) + 0.5 * random()) desc
    ) per_cuisine
    order by per_cuisine.weight desc
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
