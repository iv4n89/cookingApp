import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateJsonKeys } from './lib/find-duplicate-json-keys.mjs';

const CLASSIFIER_VERSION = 'culinary-affinity-es-v1';
const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter', 'all_year']);
const ROOT_FIELDS = new Set(['schemaVersion', 'classifierVersion', 'profiles']);
const PROFILE_FIELDS = new Set(['title', 'seasons', 'confidence', 'source']);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const recipesPath = join(repoRoot, 'scripts/seed/recipes.json');
const profilesPath = process.env.RECIPE_SEASON_PROFILES_PATH
  ? resolve(process.env.RECIPE_SEASON_PROFILES_PATH)
  : join(repoRoot, 'scripts/seed/recipe-season-profiles.json');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireCondition(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateAllowedFields(errors, record, allowed, path) {
  for (const field of Object.keys(record)) {
    requireCondition(errors, allowed.has(field), `${path}: campo no permitido ${field}`);
  }
}

let dataset;
let datasetText;
let recipes;
try {
  [datasetText, recipes] = await Promise.all([
    readFile(profilesPath, 'utf8'),
    readFile(recipesPath, 'utf8').then(JSON.parse),
  ]);
  dataset = JSON.parse(datasetText);
} catch (error) {
  console.error(`No se pudieron leer los perfiles estacionales: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

const errors = [];
requireCondition(errors, isRecord(dataset), 'La raíz debe ser un objeto');
const root = isRecord(dataset) ? dataset : {};
validateAllowedFields(errors, root, ROOT_FIELDS, 'Raíz');
for (const key of findDuplicateJsonKeys(datasetText)) {
  errors.push(`Clave JSON duplicada: ${key}`);
}

requireCondition(errors, root.schemaVersion === 1, 'schemaVersion debe ser 1');
requireCondition(
  errors,
  root.classifierVersion === CLASSIFIER_VERSION,
  `classifierVersion debe ser ${CLASSIFIER_VERSION}`,
);
requireCondition(errors, Array.isArray(root.profiles), 'profiles debe ser un array');

const recipeTitles = recipes.map((recipe) => recipe.title);
const profiles = Array.isArray(root.profiles) ? root.profiles : [];
const profileTitles = [];

for (const [index, profile] of profiles.entries()) {
  const path = `profiles[${index}]`;
  requireCondition(errors, isRecord(profile), `${path} debe ser un objeto`);
  if (!isRecord(profile)) continue;
  validateAllowedFields(errors, profile, PROFILE_FIELDS, path);

  requireCondition(
    errors,
    typeof profile.title === 'string' && profile.title.trim() !== '',
    `${path}.title debe ser un texto no vacío`,
  );
  if (typeof profile.title === 'string') profileTitles.push(profile.title);

  requireCondition(errors, Array.isArray(profile.seasons), `${path}.seasons debe ser un array`);
  const seasons = Array.isArray(profile.seasons) ? profile.seasons : [];
  requireCondition(errors, seasons.length > 0, `${path}.seasons no puede estar vacío`);
  requireCondition(
    errors,
    seasons.every((season) => typeof season === 'string' && SEASONS.has(season)),
    `${path}.seasons contiene valores desconocidos`,
  );
  requireCondition(
    errors,
    new Set(seasons).size === seasons.length,
    `${path}.seasons contiene duplicados`,
  );
  requireCondition(
    errors,
    !seasons.includes('all_year') || seasons.length === 1,
    `${path}: all_year debe ser exclusivo`,
  );
  requireCondition(errors, profile.confidence === 'high', `${path}.confidence debe ser high`);
  requireCondition(errors, profile.source === 'curated', `${path}.source debe ser curated`);
}

const recipeSet = new Set(recipeTitles);
const profileSet = new Set(profileTitles);
requireCondition(
  errors,
  recipeSet.size === recipeTitles.length,
  'recipes.json contiene títulos duplicados',
);
requireCondition(
  errors,
  profileSet.size === profileTitles.length,
  'profiles contiene títulos duplicados',
);
requireCondition(
  errors,
  profiles.length === recipeTitles.length,
  `profiles debe contener exactamente ${recipeTitles.length} entradas`,
);
for (const title of recipeTitles) {
  requireCondition(errors, profileSet.has(title), `Falta perfil para: ${title}`);
}
for (const title of profileTitles) {
  requireCondition(errors, recipeSet.has(title), `Perfil sin receta: ${title}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Perfiles estacionales inválidos: ${errors.length} error(es).`);
  process.exitCode = 1;
} else {
  console.log(
    `Perfiles estacionales válidos: ${profiles.length} recetas, versión ${CLASSIFIER_VERSION}.`,
  );
}
