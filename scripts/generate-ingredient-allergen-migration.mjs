import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findDuplicateJsonKeys } from './lib/find-duplicate-json-keys.mjs';

const EXPECTED_INGREDIENT_COUNT = 331;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const validatorPath = join(here, 'validate-ingredient-allergen-profiles.mjs');
const datasetPath = process.env.INGREDIENT_ALLERGEN_PROFILES_PATH
  ? resolve(process.env.INGREDIENT_ALLERGEN_PROFILES_PATH)
  : join(repoRoot, 'packages/shared/src/data/ingredient-allergen-profiles.json');
const seedPath = process.env.INGREDIENT_ALLERGEN_SEED_PATH
  ? resolve(process.env.INGREDIENT_ALLERGEN_SEED_PATH)
  : join(repoRoot, 'supabase/migrations/0007_ingredients_seed.sql');
const migrationPath = process.env.INGREDIENT_ALLERGEN_MIGRATION_PATH
  ? resolve(process.env.INGREDIENT_ALLERGEN_MIGRATION_PATH)
  : join(repoRoot, 'supabase/migrations/0051_ingredient_allergen_profiles.sql');

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `array[${values.map(sqlText).join(', ')}]::text[]`;
}

function validateDataset() {
  const result = spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      INGREDIENT_ALLERGEN_PROFILES_PATH: datasetPath,
      INGREDIENT_ALLERGEN_SEED_PATH: seedPath,
    },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error('El dataset de seguridad no superó su validador.');
  }
}

function renderProfiles(ingredients) {
  return Object.entries(ingredients)
    .map(
      ([name, profile]) =>
        `    (${[
          sqlText(name),
          sqlArray(profile.sourceIds),
          sqlText(profile.sourceRef),
          sqlText(profile.reviewKind),
          sqlText(profile.compositionStatus),
        ].join(', ')})`,
    )
    .join(',\n');
}

function renderEntries(ingredients, field) {
  return Object.entries(ingredients)
    .flatMap(([name, profile]) =>
      profile[field].map((value) => `    (${sqlText(name)}, ${sqlText(value)})`),
    )
    .join(',\n');
}

function renderMigration(dataset, checksum) {
  const profileRows = renderProfiles(dataset.ingredients);
  const allergenRows = renderEntries(dataset.ingredients, 'allergens');
  const dietRows = renderEntries(dataset.ingredients, 'incompatibleDiets');
  const profileCount = Object.keys(dataset.ingredients).length;

  return `-- Generado por scripts/generate-ingredient-allergen-migration.mjs.
-- dataset-sha256: ${checksum}
-- profile-count: ${profileCount}

create table public.ingredient_allergen_datasets (
  version text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  supported_exclusions text[] not null,
  supported_diets text[] not null,
  check (
    supported_exclusions = array[
      'gluten', 'crustaceans', 'molluscs', 'egg', 'fish', 'peanut', 'soy',
      'milk', 'nuts', 'celery', 'mustard', 'sesame', 'pork', 'alcohol'
    ]::text[]
  ),
  check (supported_diets = array['vegan', 'vegetarian']::text[])
);

create table public.ingredient_allergen_profiles (
  ingredient_id uuid primary key
    references public.ingredients (id) on delete cascade,
  dataset_version text not null
    references public.ingredient_allergen_datasets (version) on delete restrict,
  source_ids text[] not null check (cardinality(source_ids) > 0),
  source_ref text not null check (btrim(source_ref) <> ''),
  review_kind text not null
    check (review_kind in ('intrinsic_named_ingredient', 'compound_formula_unknown')),
  composition_status text not null
    check (composition_status in ('exact_reviewed', 'variable_unknown')),
  check (
    (composition_status = 'exact_reviewed' and review_kind = 'intrinsic_named_ingredient')
    or (
      composition_status = 'variable_unknown'
      and review_kind = 'compound_formula_unknown'
    )
  )
);

create table public.ingredient_allergen_entries (
  ingredient_id uuid not null
    references public.ingredient_allergen_profiles (ingredient_id) on delete cascade,
  allergen text not null
    check (
      allergen in (
        'gluten', 'crustaceans', 'molluscs', 'egg', 'fish', 'peanut', 'soy',
        'milk', 'nuts', 'celery', 'mustard', 'sesame', 'pork', 'alcohol'
      )
    ),
  primary key (ingredient_id, allergen)
);

create table public.ingredient_diet_entries (
  ingredient_id uuid not null
    references public.ingredient_allergen_profiles (ingredient_id) on delete cascade,
  incompatible_diet text not null check (incompatible_diet in ('vegan', 'vegetarian')),
  primary key (ingredient_id, incompatible_diet)
);

insert into public.ingredient_allergen_datasets (
  version,
  sha256,
  supported_exclusions,
  supported_diets
) values (
  ${sqlText(dataset.datasetVersion)},
  ${sqlText(checksum)},
  ${sqlArray(dataset.supportedExclusions)},
  ${sqlArray(dataset.supportedDiets)}
);

with profile_data (
  normalized_name,
  source_ids,
  source_ref,
  review_kind,
  composition_status
) as (
  values
${profileRows}
)
insert into public.ingredient_allergen_profiles (
  ingredient_id,
  dataset_version,
  source_ids,
  source_ref,
  review_kind,
  composition_status
)
select
  i.id,
  ${sqlText(dataset.datasetVersion)},
  p.source_ids,
  p.source_ref,
  p.review_kind,
  p.composition_status
from profile_data p
join public.ingredients i on i.normalized_name = p.normalized_name;

with allergen_data (normalized_name, allergen) as (
  values
${allergenRows}
)
insert into public.ingredient_allergen_entries (ingredient_id, allergen)
select i.id, a.allergen
from allergen_data a
join public.ingredients i on i.normalized_name = a.normalized_name;

with diet_data (normalized_name, incompatible_diet) as (
  values
${dietRows}
)
insert into public.ingredient_diet_entries (ingredient_id, incompatible_diet)
select i.id, d.incompatible_diet
from diet_data d
join public.ingredients i on i.normalized_name = d.normalized_name;

do $$
begin
  if (
    select count(*)
    from public.ingredient_allergen_profiles
    where dataset_version = ${sqlText(dataset.datasetVersion)}
  ) <> ${profileCount} then
    raise exception 'se esperaban ${profileCount} ingredientes con perfil de seguridad';
  end if;
end;
$$;

alter table public.ingredient_allergen_datasets enable row level security;
alter table public.ingredient_allergen_profiles enable row level security;
alter table public.ingredient_allergen_entries enable row level security;
alter table public.ingredient_diet_entries enable row level security;

create policy "ingredient_allergen_datasets_select_authenticated"
on public.ingredient_allergen_datasets
for select to authenticated
using (true);

create policy "ingredient_allergen_profiles_select_authenticated"
on public.ingredient_allergen_profiles
for select to authenticated
using (true);

create policy "ingredient_allergen_entries_select_authenticated"
on public.ingredient_allergen_entries
for select to authenticated
using (true);

create policy "ingredient_diet_entries_select_authenticated"
on public.ingredient_diet_entries
for select to authenticated
using (true);

revoke all
on public.ingredient_allergen_datasets,
   public.ingredient_allergen_profiles,
   public.ingredient_allergen_entries,
   public.ingredient_diet_entries
from public, anon, authenticated;

grant select
on public.ingredient_allergen_datasets,
   public.ingredient_allergen_profiles,
   public.ingredient_allergen_entries,
   public.ingredient_diet_entries
to authenticated;

grant select, insert, update, delete
on public.ingredient_allergen_datasets,
   public.ingredient_allergen_profiles,
   public.ingredient_allergen_entries,
   public.ingredient_diet_entries
to service_role;
`;
}

validateDataset();

const datasetText = await readFile(datasetPath, 'utf8');
const duplicateKeys = findDuplicateJsonKeys(datasetText);
if (duplicateKeys.length > 0) {
  throw new Error(`Dataset con claves duplicadas: ${duplicateKeys.join(', ')}`);
}
const dataset = JSON.parse(datasetText);
const profileCount = Object.keys(dataset.ingredients).length;
if (profileCount !== EXPECTED_INGREDIENT_COUNT) {
  throw new Error(`Se esperaban ${EXPECTED_INGREDIENT_COUNT} perfiles, hay ${profileCount}.`);
}

const checksum = createHash('sha256').update(datasetText).digest('hex');
const expectedMigration = renderMigration(dataset, checksum);
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  let actualMigration = '';
  try {
    actualMigration = await readFile(migrationPath, 'utf8');
  } catch {
    // La comparación inferior unifica ausencia y divergencia en un único error.
  }
  if (actualMigration !== expectedMigration) {
    console.error('La migración de seguridad no coincide con el dataset.');
    process.exitCode = 1;
  } else {
    console.log(`Migración de seguridad reproducible: ${checksum}`);
  }
} else {
  await writeFile(migrationPath, expectedMigration);
  console.log(`Migración generada: ${migrationPath}`);
}
