create function public.valid_recipe_seasons(candidate text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    candidate is not null
    and cardinality(candidate) > 0
    and candidate <@ array['spring', 'summer', 'autumn', 'winter', 'all_year']::text[]
    and cardinality(candidate) = (
      select count(distinct season)
      from unnest(candidate) as season
    )
    and (
      not ('all_year' = any(candidate))
      or cardinality(candidate) = 1
    );
$$;

create table public.recipe_season_profiles (
  recipe_id uuid primary key
    references public.recipes (id) on delete cascade,
  seasons text[] not null
    check (public.valid_recipe_seasons(seasons)),
  confidence text not null
    check (confidence in ('high', 'medium', 'low')),
  source text not null
    check (source in ('curated', 'generated', 'backfill')),
  classifier_version text not null
    check (btrim(classifier_version) <> ''),
  classified_at timestamptz not null default now()
);

create function public.upsert_recipe_season_profile(
  p_recipe_id uuid,
  p_seasons text[],
  p_confidence text,
  p_source text,
  p_classifier_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.valid_recipe_seasons(p_seasons) then
    raise exception 'invalid recipe season profile'
      using errcode = '22023';
  end if;

  if p_confidence not in ('high', 'medium', 'low') then
    raise exception 'invalid recipe season confidence'
      using errcode = '22023';
  end if;

  if p_source not in ('curated', 'generated', 'backfill') then
    raise exception 'invalid recipe season source'
      using errcode = '22023';
  end if;

  if p_classifier_version is null or btrim(p_classifier_version) = '' then
    raise exception 'invalid recipe season classifier version'
      using errcode = '22023';
  end if;

  insert into public.recipe_season_profiles as current_profile (
    recipe_id,
    seasons,
    confidence,
    source,
    classifier_version,
    classified_at
  ) values (
    p_recipe_id,
    p_seasons,
    p_confidence,
    p_source,
    p_classifier_version,
    now()
  )
  on conflict (recipe_id) do update
  set
    seasons = excluded.seasons,
    confidence = excluded.confidence,
    source = excluded.source,
    classifier_version = excluded.classifier_version,
    classified_at = excluded.classified_at
  where
    (
      excluded.source = 'curated'
      or (
        excluded.source = 'generated'
        and current_profile.source in ('generated', 'backfill')
      )
    )
    and row(
      current_profile.seasons,
      current_profile.confidence,
      current_profile.source,
      current_profile.classifier_version
    ) is distinct from row(
      excluded.seasons,
      excluded.confidence,
      excluded.source,
      excluded.classifier_version
    );
end;
$$;

alter table public.recipe_season_profiles enable row level security;

create policy "recipe_season_profiles_select_authenticated"
on public.recipe_season_profiles
for select to authenticated
using (true);

revoke all on function public.valid_recipe_seasons(text[])
from public, anon, authenticated;

revoke all on function public.upsert_recipe_season_profile(
  uuid,
  text[],
  text,
  text,
  text
) from public, anon, authenticated;

revoke all on public.recipe_season_profiles
from public, anon, authenticated;

grant execute on function public.valid_recipe_seasons(text[])
to service_role;

grant execute on function public.upsert_recipe_season_profile(
  uuid,
  text[],
  text,
  text,
  text
) to service_role;

grant select on public.recipe_season_profiles
to authenticated;

grant select, insert, update, delete on public.recipe_season_profiles
to service_role;
