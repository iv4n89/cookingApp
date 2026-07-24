// Valida por completo un artefacto revisado y aplica cada perfil mediante el RPC atómico.
//
// SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
//   node scripts/recipe-seasons/apply-profiles.mjs [profiles.local.json]

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateJsonKeys } from '../lib/find-duplicate-json-keys.mjs';
import { CLASSIFIER_VERSION, validateBackfillArtifact } from './profile-contract.mjs';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = resolve(process.argv[2] ?? join(here, 'profiles.local.json'));
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const artifactText = await readFile(artifactPath, 'utf8');
const duplicateKeys = findDuplicateJsonKeys(artifactText);
if (duplicateKeys.length > 0) {
  throw new Error(`Claves JSON duplicadas: ${duplicateKeys.join(', ')}`);
}
const artifact = JSON.parse(artifactText);
const errors = validateBackfillArtifact(artifact);
if (errors.length > 0) throw new Error(`Artefacto inválido:\n${errors.join('\n')}`);

async function get(path) {
  const response = await fetch(`${rest}/${path}`, { headers });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const ids = artifact.profiles.map((profile) => profile.recipeId);
const chunks = Array.from(
  { length: Math.ceil(ids.length / 100) },
  (_, index) => ids.slice(index * 100, index * 100 + 100),
);
const recipes = (
  await Promise.all(
    chunks.map((chunk) =>
      get(`recipes?select=id,reusable&id=in.(${encodeURIComponent(chunk.join(','))})`)
    ),
  )
).flat();
const reusableIds = new Set(
  recipes.filter((recipe) => recipe.reusable).map((recipe) => recipe.id),
);
const invalidIds = ids.filter((id) => !reusableIds.has(id));
if (invalidIds.length > 0) {
  throw new Error(`UUID inexistente o receta no reutilizable: ${invalidIds.join(', ')}`);
}

const existing = (
  await Promise.all(
    chunks.map((chunk) =>
      get(
        `recipe_season_profiles?select=recipe_id,source&recipe_id=in.(${
          encodeURIComponent(chunk.join(','))
        })`,
      )
    ),
  )
).flat();
const existingById = new Map(
  existing.map((profile) => [profile.recipe_id, profile.source]),
);

let applied = 0;
let protectedExisting = 0;
for (const profile of artifact.profiles) {
  if (existingById.has(profile.recipeId)) {
    protectedExisting += 1;
    continue;
  }
  const response = await fetch(`${rest}/rpc/upsert_recipe_season_profile`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      p_recipe_id: profile.recipeId,
      p_seasons: profile.seasons,
      p_confidence: 'low',
      p_source: 'backfill',
      p_classifier_version: CLASSIFIER_VERSION,
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${profile.recipeId}: ${response.status} ${await response.text()}`);
  }
  applied += 1;
}

console.log(
  `Backfill aplicado: ${applied}; perfiles existentes protegidos: ${protectedExisting}; ` +
    `total revisado: ${artifact.profiles.length}.`,
);
