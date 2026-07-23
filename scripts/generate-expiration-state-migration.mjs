import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateJsonKeys } from './lib/find-duplicate-json-keys.mjs';

const EXPECTED_INGREDIENT_COUNT = 331;
const TUPLE_PATTERN =
  /^\s*\('(?:[^']|'')*',\s*'((?:[^']|'')*)',\s*'(?:[^']|'')*'\)[,;]?\s*$/;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const datasetPath = process.env.EXPIRATION_PROFILES_PATH
  ? resolve(process.env.EXPIRATION_PROFILES_PATH)
  : join(repoRoot, 'packages/shared/src/data/ingredient-expiration-profiles.json');
const migrationPath = process.env.EXPIRATION_MIGRATION_PATH
  ? resolve(process.env.EXPIRATION_MIGRATION_PATH)
  : join(repoRoot, 'supabase/migrations/0049_expiration_profiles.sql');
const seedPath = process.env.EXPIRATION_SEED_PATH
  ? resolve(process.env.EXPIRATION_SEED_PATH)
  : join(repoRoot, 'supabase/migrations/0007_ingredients_seed.sql');

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNullableInteger(value) {
  return value === null ? 'null' : String(value);
}

function parseSeedNames(seedText) {
  return seedText
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith("('"))
    .map((line) => {
      const match = line.match(TUPLE_PATTERN);
      if (!match) throw new Error(`Tupla del seed no reconocida: ${line}`);
      return match[1].replaceAll("''", "'");
    });
}

function validateInputs(dataset, seedNames) {
  const profileIds = Object.keys(dataset.profiles ?? {});
  const ingredientNames = Object.keys(dataset.ingredients ?? {});
  const seedSet = new Set(seedNames);

  if (seedNames.length !== EXPECTED_INGREDIENT_COUNT || seedSet.size !== seedNames.length) {
    throw new Error('El seed debe contener 331 normalized_name únicos.');
  }
  if (ingredientNames.length !== EXPECTED_INGREDIENT_COUNT) {
    throw new Error('El dataset debe contener 331 ingredientes.');
  }
  for (const name of ingredientNames) {
    if (!seedSet.has(name)) throw new Error(`Ingrediente del dataset fuera del seed: ${name}`);
  }
  for (const name of seedNames) {
    if (!Object.hasOwn(dataset.ingredients, name)) {
      throw new Error(`Ingrediente del seed sin perfil: ${name}`);
    }
  }
  for (const [name, mapping] of Object.entries(dataset.ingredients)) {
    if (!Object.hasOwn(dataset.profiles, mapping.profileId)) {
      throw new Error(`Ingrediente ${name} usa un perfil inexistente: ${mapping.profileId}`);
    }
  }
  if (profileIds.length === 0) throw new Error('El dataset no contiene perfiles.');
}

function renderProfiles(profiles) {
  return Object.entries(profiles)
    .map(([id, profile]) =>
      [
        '  (',
        [
          sqlText(id),
          sqlNullableInteger(profile.minDays),
          sqlNullableInteger(profile.maxDays),
          sqlText(profile.confidence),
          String(profile.priorityEligible),
          sqlText(profile.sourceId),
          sqlText(profile.sourceRef),
        ].join(', '),
        ')',
      ].join(''),
    )
    .join(',\n');
}

function renderMappings(ingredients) {
  return Object.entries(ingredients)
    .map(
      ([normalizedName, mapping]) =>
        `    (${sqlText(normalizedName)}, ${sqlText(mapping.profileId)}, ${sqlText(mapping.match)})`,
    )
    .join(',\n');
}

function renderMigration(dataset, checksum) {
  const profileCount = Object.keys(dataset.profiles).length;
  const ingredientCount = Object.keys(dataset.ingredients).length;

  return `-- Generado por scripts/generate-expiration-state-migration.mjs.
-- dataset-sha256: ${checksum}

create table public.expiration_profiles (
  id text primary key,
  min_days integer,
  max_days integer,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  priority_eligible boolean not null,
  source_id text not null,
  source_ref text not null,
  check (
    (
      min_days is not null
      and max_days is not null
      and min_days > 0
      and max_days > 0
      and min_days <= max_days
    )
    or (min_days is null and max_days is null and priority_eligible = false)
  )
);

create table public.ingredient_expiration_profiles (
  ingredient_id uuid primary key references public.ingredients (id) on delete cascade,
  profile_id text not null references public.expiration_profiles (id) on delete restrict,
  match_type text not null check (match_type in ('direct', 'family', 'fallback'))
);

insert into public.expiration_profiles (
  id, min_days, max_days, confidence, priority_eligible, source_id, source_ref
) values
${renderProfiles(dataset.profiles)};

with mappings (normalized_name, profile_id, match_type) as (
  values
${renderMappings(dataset.ingredients)}
)
insert into public.ingredient_expiration_profiles (ingredient_id, profile_id, match_type)
select i.id, m.profile_id, m.match_type
from mappings m
join public.ingredients i on i.normalized_name = m.normalized_name;

do $$
begin
  if (select count(*) from public.expiration_profiles) <> ${profileCount} then
    raise exception 'se esperaban ${profileCount} perfiles de caducidad';
  end if;
  if (select count(*) from public.ingredient_expiration_profiles) <> ${ingredientCount} then
    raise exception 'se esperaban ${ingredientCount} ingredientes con perfil';
  end if;
end;
$$;

alter table public.expiration_profiles enable row level security;
alter table public.ingredient_expiration_profiles enable row level security;

create policy "expiration_profiles_select_authenticated"
on public.expiration_profiles
for select to authenticated
using (true);

create policy "ingredient_expiration_profiles_select_authenticated"
on public.ingredient_expiration_profiles
for select to authenticated
using (true);

grant select on public.expiration_profiles, public.ingredient_expiration_profiles
to authenticated;

grant select, insert, update, delete
on public.expiration_profiles, public.ingredient_expiration_profiles
to service_role;
`;
}

const datasetText = await readFile(datasetPath, 'utf8');
const seedText = await readFile(seedPath, 'utf8');
const duplicateKeys = findDuplicateJsonKeys(datasetText);
if (duplicateKeys.length > 0) {
  throw new Error(`Dataset con claves duplicadas: ${duplicateKeys.join(', ')}`);
}
const dataset = JSON.parse(datasetText);
const seedNames = parseSeedNames(seedText);
validateInputs(dataset, seedNames);

const checksum = createHash('sha256').update(datasetText).digest('hex');
const expectedMigration = renderMigration(dataset, checksum);
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  let actualMigration = '';
  try {
    actualMigration = await readFile(migrationPath, 'utf8');
  } catch {
    // La comparación inferior ofrece un único diagnóstico para ausencia o divergencia.
  }
  if (actualMigration !== expectedMigration) {
    console.error('La migración de perfiles no coincide con el dataset.');
    process.exitCode = 1;
  } else {
    console.log(`Migración de caducidad reproducible: ${checksum}`);
  }
} else {
  await writeFile(migrationPath, expectedMigration);
  console.log(`Migración generada: ${migrationPath}`);
}
