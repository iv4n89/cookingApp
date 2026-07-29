-- household_today_decision v8: la ventana de candidatas pasa de 31 a 121 (el catálogo tiene
-- ~495 recetas reusables) y el random() de 0062 se sustituye por la semilla del snapshot, que
-- es la misma durante todo el día para un hogar. Además, lo cocinado en los últimos 14 días
-- baja al final: penaliza, no excluye, para que la Home no se quede corta.

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
  v_seed text;
  v_household_id uuid := public.current_household_id();
begin
  v_decision := public.household_recommendation_decision(p_meal_type, 120);
  v_seed := coalesce(v_decision->>'rotationSeed', '');

  -- Productos prioritarios: uno por producto de la despensa. El aviso es "consume el tomate", no
  -- "consume el lote 3 de tomate", así que de varios lotes del mismo producto se queda el más
  -- urgente. Se agrupa por pantry_item_id y no por canónico a propósito: la cebolla blanca y la
  -- morada comparten canónico, y fundirlas dejaría sin avisar de una de las dos. Entre productos,
  -- priority antes que consume_soon y luego más antiguos primero.
  select coalesce(jsonb_agg(product order by rank_key, age_days desc), '[]'::jsonb)
  into v_priority
  from (
    select distinct on (s.pantry_item_id)
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
    order by
      s.pantry_item_id,
      case s.status when 'priority' then 0 when 'consume_soon' then 1 else 2 end,
      s.age_days desc
  ) ranked;

  -- Candidatas de la franja, rotadas por la semilla del día dentro de cada nivel de faltantes
  -- (menos faltantes primero) y con lo cocinado hace poco al final.
  select coalesce(jsonb_agg(
    jsonb_build_object('recipeId', recipe_id, 'missing', missing, 'prio', prio, 'card', card)
    order by cooked_recently, missing, public.rotation_fraction(v_seed, recipe_id)
  ), '[]'::jsonb)
  into v_meal
  from (
    select
      candidate->>'recipeId' as recipe_id,
      coalesce((candidate->'score'->>'missingIngredientCount')::int, 0) as missing,
      coalesce((candidate->'score'->>'priorityUsage')::numeric, 0) as prio,
      exists (
        select 1 from public.cooked_recipes cr
        where cr.household_id = v_household_id
          and cr.recipe_id = (candidate->>'recipeId')::uuid
          and cr.restored_at is null
          and cr.cooked_at > now() - interval '14 days'
      ) as cooked_recently,
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

  -- Fallback: si la franja no deja candidatas, usa todas (sin filtro), con la misma rotación.
  if jsonb_array_length(v_meal) = 0 then
    select coalesce(jsonb_agg(
      jsonb_build_object('recipeId', recipe_id, 'missing', missing, 'prio', prio, 'card', card)
      order by cooked_recently, missing, public.rotation_fraction(v_seed, recipe_id)
    ), '[]'::jsonb)
    into v_meal
    from (
      select
        candidate->>'recipeId' as recipe_id,
        coalesce((candidate->'score'->>'missingIngredientCount')::int, 0) as missing,
        coalesce((candidate->'score'->>'priorityUsage')::numeric, 0) as prio,
        exists (
          select 1 from public.cooked_recipes cr
          where cr.household_id = v_household_id
            and cr.recipe_id = (candidate->>'recipeId')::uuid
            and cr.restored_at is null
            and cr.cooked_at > now() - interval '14 days'
        ) as cooked_recently,
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
  -- (menos faltantes, luego más uso crítico, y la semilla entre iguales); si no, la primera del
  -- orden rotado.
  select elem->>'recipeId'
  into v_featured_id
  from jsonb_array_elements(v_meal) elem
  where (elem->>'prio')::numeric > 0 and (elem->>'missing')::int <= 2
  order by (elem->>'missing')::int asc, (elem->>'prio')::numeric desc,
           public.rotation_fraction(v_seed, elem->>'recipeId')
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

  -- Discover: una por tipo de cocina, ponderando gusto y rotación del día (tira hacia el estilo
  -- del hogar sin perder variedad), 5 por peso, sin las de pantry.
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
        (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0)
          + 0.5 * public.rotation_fraction(v_seed, candidate->>'recipeId')) as weight
      from jsonb_array_elements(v_decision->'candidates') as candidate
      join public.recipes r on r.id = (candidate->>'recipeId')::uuid
      where not ((candidate->>'recipeId') = any(v_pantry_ids))
      order by r.tags[1],
        (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0)
          + 0.5 * public.rotation_fraction(v_seed, candidate->>'recipeId')) desc
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
