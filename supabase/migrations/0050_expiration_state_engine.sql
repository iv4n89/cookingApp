-- Estado aproximado y reproducible de lotes activos. No representa una fecha
-- de seguridad alimentaria y omite los lotes fuera de la ventana estimada.

create function public.evaluate_expiration_state(
  p_min_days integer,
  p_max_days integer,
  p_priority_eligible boolean,
  p_acquired_at timestamptz,
  p_evaluated_at timestamptz
)
returns table (
  age_days numeric,
  status text,
  reason_code text
)
language sql
immutable
set search_path = ''
as $$
  with calculation as (
    select
      greatest(
        extract(epoch from (p_evaluated_at - p_acquired_at)) / 86400.0,
        0
      )::numeric as age_days,
      least(p_min_days * 0.25, 7)::numeric as warning_days
  )
  select
    c.age_days,
    case
      when p_priority_eligible is not true
        or p_acquired_at is null
        or p_evaluated_at is null
        or p_min_days is null
        or p_max_days is null
        or c.age_days is null
        or c.age_days > p_max_days
        then null
      when c.age_days < p_min_days - c.warning_days then 'fresh'
      when c.age_days < p_min_days then 'consume_soon'
      else 'priority'
    end,
    case
      when p_priority_eligible is not true
        or p_acquired_at is null
        or p_evaluated_at is null
        or p_min_days is null
        or p_max_days is null
        or c.age_days is null
        or c.age_days > p_max_days
        then null
      when c.age_days < p_min_days - c.warning_days then 'within_estimated_window'
      when c.age_days < p_min_days then 'approaching_estimated_window'
      else 'inside_priority_window'
    end
  from calculation c;
$$;

revoke execute on function public.evaluate_expiration_state(
  integer, integer, boolean, timestamptz, timestamptz
) from public, anon, authenticated;

create function public.household_expiration_snapshot()
returns table (
  batch_id uuid,
  pantry_item_id uuid,
  canonical_ingredient_id uuid,
  ingredient_name text,
  remaining_quantity numeric,
  unit text,
  acquired_at timestamptz,
  evaluated_at timestamptz,
  age_days numeric,
  status text,
  confidence text,
  match_type text,
  min_days integer,
  max_days integer,
  reason_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.current_household_id();
  v_evaluated_at timestamptz := statement_timestamp();
begin
  if v_household is null then
    raise exception 'hogar no encontrado';
  end if;
  perform public.require_household_member(v_household);

  return query
  select
    pb.id,
    pb.pantry_item_id,
    coalesce(i.canonical_id, i.id),
    pb.name,
    pb.remaining_quantity,
    pb.unit,
    coalesce(pb.purchased_at, pb.created_at),
    v_evaluated_at,
    evaluation.age_days,
    evaluation.status,
    profile.confidence,
    case
      when canonical_mapping.profile_id is not null then canonical_mapping.match_type
      else direct_mapping.match_type
    end,
    profile.min_days,
    profile.max_days,
    evaluation.reason_code
  from public.pantry_batches pb
  join public.pantry_items pantry
    on pantry.id = pb.pantry_item_id
    and pantry.household_id = v_household
  join public.ingredients i on i.id = pb.ingredient_id
  left join public.ingredient_expiration_profiles canonical_mapping
    on canonical_mapping.ingredient_id = coalesce(i.canonical_id, i.id)
  left join public.ingredient_expiration_profiles direct_mapping
    on direct_mapping.ingredient_id = i.id
  join public.expiration_profiles profile
    on profile.id = coalesce(canonical_mapping.profile_id, direct_mapping.profile_id)
  cross join lateral public.evaluate_expiration_state(
    profile.min_days,
    profile.max_days,
    profile.priority_eligible,
    coalesce(pb.purchased_at, pb.created_at),
    v_evaluated_at
  ) evaluation
  where pb.household_id = v_household
    and pb.pantry_item_id is not null
    and pb.ingredient_id is not null
    and coalesce(pb.remaining_quantity, 0) > 0
    and evaluation.status is not null;
end;
$$;

revoke execute on function public.household_expiration_snapshot()
from public, anon;
grant execute on function public.household_expiration_snapshot()
to authenticated;
