import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateJsonKeys } from './lib/find-duplicate-json-keys.mjs';
import {
  EXACT_REVIEWED_INGREDIENTS,
  VARIABLE_INGREDIENTS,
} from './lib/ingredient-safety-policy.mjs';

const EXPECTED_INGREDIENT_COUNT = 399;
const EXPECTED_EXCLUSIONS = [
  'gluten',
  'crustaceans',
  'molluscs',
  'egg',
  'fish',
  'peanut',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'pork',
  'alcohol',
];
const EXPECTED_DIETS = ['vegan', 'vegetarian'];
const COMPOSITION_STATUSES = new Set(['exact_reviewed', 'variable_unknown']);
const REVIEW_KINDS = new Set(['intrinsic_named_ingredient', 'compound_formula_unknown']);
const ROOT_FIELDS = new Set([
  'schemaVersion',
  'datasetVersion',
  'supportedExclusions',
  'supportedDiets',
  'sources',
  'ingredients',
]);
const SOURCE_FIELDS = new Set(['title', 'url', 'retrievedAt', 'scope']);
const INGREDIENT_FIELDS = new Set([
  'allergens',
  'incompatibleDiets',
  'compositionStatus',
  'sourceIds',
  'sourceRef',
  'reviewKind',
]);
const EXACT_REVIEWED_SET = new Set(EXACT_REVIEWED_INGREDIENTS);
const VARIABLE_SET = new Set(VARIABLE_INGREDIENTS);
const TUPLE_PATTERN =
  /^\s*\('(?:[^']|'')*',\s*'((?:[^']|'')*)',\s*'(?:[^']|'')*'\)[,;]?\s*$/;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const seedPath = process.env.INGREDIENT_ALLERGEN_SEED_PATH
  ? resolve(process.env.INGREDIENT_ALLERGEN_SEED_PATH)
  : join(repoRoot, 'supabase/migrations/0007_ingredients_seed.sql');
const datasetPath = process.env.INGREDIENT_ALLERGEN_PROFILES_PATH
  ? resolve(process.env.INGREDIENT_ALLERGEN_PROFILES_PATH)
  : join(repoRoot, 'packages/shared/src/data/ingredient-allergen-profiles.json');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateAllowedFields(errors, record, allowedFields, path) {
  for (const field of Object.keys(record)) {
    addError(errors, allowedFields.has(field), `${path}: campo no permitido ${field}`);
  }
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

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function validateStringArray(errors, value, allowed, path) {
  addError(errors, Array.isArray(value), `${path} debe ser un array`);
  if (!Array.isArray(value)) return;

  const unique = new Set(value);
  addError(errors, unique.size === value.length, `${path} contiene duplicados`);
  for (const item of value) {
    addError(
      errors,
      typeof item === 'string' && allowed.has(item),
      `${path} contiene un valor desconocido: ${String(item)}`,
    );
  }
}

function validateSources(errors, sources) {
  for (const [sourceId, source] of Object.entries(sources)) {
    addError(errors, isRecord(source), `Fuente inválida: ${sourceId}`);
    if (!isRecord(source)) continue;

    validateAllowedFields(errors, source, SOURCE_FIELDS, `Fuente ${sourceId}`);
    for (const field of SOURCE_FIELDS) {
      addError(
        errors,
        typeof source[field] === 'string' && source[field].trim() !== '',
        `Fuente ${sourceId}: ${field} debe ser texto no vacío`,
      );
    }
    addError(
      errors,
      typeof source.url === 'string' && /^https:\/\/.+/.test(source.url),
      `Fuente ${sourceId}: url debe usar HTTPS`,
    );
  }
}

function validateIngredient(errors, name, profile, sources) {
  addError(errors, isRecord(profile), `Ingrediente inválido: ${name}`);
  if (!isRecord(profile)) return;

  validateAllowedFields(errors, profile, INGREDIENT_FIELDS, `Ingrediente ${name}`);
  validateStringArray(
    errors,
    profile.allergens,
    new Set(EXPECTED_EXCLUSIONS),
    `Ingrediente ${name}: allergens`,
  );
  validateStringArray(
    errors,
    profile.incompatibleDiets,
    new Set(EXPECTED_DIETS),
    `Ingrediente ${name}: incompatibleDiets`,
  );

  addError(
    errors,
    COMPOSITION_STATUSES.has(profile.compositionStatus),
    `Ingrediente ${name}: compositionStatus desconocido`,
  );
  addError(
    errors,
    REVIEW_KINDS.has(profile.reviewKind),
    `Ingrediente ${name}: reviewKind desconocido`,
  );
  addError(
    errors,
    typeof profile.sourceRef === 'string' && profile.sourceRef.trim() !== '',
    `Ingrediente ${name}: sourceRef debe ser texto no vacío`,
  );

  const sourceIds = profile.sourceIds;
  addError(
    errors,
    Array.isArray(sourceIds) && sourceIds.length > 0,
    `Ingrediente ${name}: sourceIds debe ser un array no vacío`,
  );
  if (Array.isArray(sourceIds)) {
    addError(
      errors,
      new Set(sourceIds).size === sourceIds.length,
      `Ingrediente ${name}: sourceIds contiene duplicados`,
    );
    for (const sourceId of sourceIds) {
      addError(
        errors,
        typeof sourceId === 'string' && Object.hasOwn(sources, sourceId),
        `Ingrediente ${name}: sourceId inexistente ${String(sourceId)}`,
      );
    }
  }

  const isVariable = profile.compositionStatus === 'variable_unknown';
  const expectedStatus = EXACT_REVIEWED_SET.has(name)
    ? 'exact_reviewed'
    : VARIABLE_SET.has(name)
      ? 'variable_unknown'
      : null;
  addError(
    errors,
    expectedStatus !== null,
    `Ingrediente ${name}: sin clasificación en la allowlist de seguridad`,
  );
  addError(
    errors,
    expectedStatus === null || profile.compositionStatus === expectedStatus,
    `Ingrediente ${name}: compositionStatus debe ser ${String(expectedStatus)}`,
  );
  addError(
    errors,
    !isVariable || profile.reviewKind === 'compound_formula_unknown',
    `Ingrediente ${name}: variable_unknown requiere compound_formula_unknown`,
  );
  addError(
    errors,
    isVariable ||
      profile.compositionStatus !== 'exact_reviewed' ||
      profile.reviewKind === 'intrinsic_named_ingredient',
    `Ingrediente ${name}: exact_reviewed requiere intrinsic_named_ingredient`,
  );
  addError(
    errors,
    !isVariable ||
      (Array.isArray(sourceIds) && sourceIds.includes('variable-composition-policy')),
    `Ingrediente ${name}: variable_unknown requiere variable-composition-policy`,
  );
}

const [seedText, datasetText] = await Promise.all([
  readFile(seedPath, 'utf8'),
  readFile(datasetPath, 'utf8'),
]);
const duplicateKeys = findDuplicateJsonKeys(datasetText);
let dataset;

try {
  dataset = JSON.parse(datasetText);
} catch (error) {
  console.error(`JSON inválido en ${datasetPath}: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

const errors = duplicateKeys.map((key) => `Clave JSON duplicada: ${key}`);
const seedNames = parseSeedNames(seedText);
const seedSet = new Set(seedNames);
const policyNames = [...EXACT_REVIEWED_INGREDIENTS, ...VARIABLE_INGREDIENTS];
const policySet = new Set(policyNames);

addError(
  errors,
  seedNames.length === EXPECTED_INGREDIENT_COUNT && seedSet.size === seedNames.length,
  'El seed debe contener 399 normalized_name únicos',
);
addError(
  errors,
  policyNames.length === EXPECTED_INGREDIENT_COUNT && policySet.size === policyNames.length,
  'Las allowlists deben clasificar 399 ingredientes únicos y sin solapamientos',
);
for (const name of seedNames) {
  addError(errors, policySet.has(name), `Ingrediente sin política de seguridad: ${name}`);
}
for (const name of policyNames) {
  addError(errors, seedSet.has(name), `Ingrediente de política fuera del seed: ${name}`);
}
addError(errors, isRecord(dataset), 'La raíz debe ser un objeto');

const root = isRecord(dataset) ? dataset : {};
const sources = isRecord(root.sources) ? root.sources : {};
const ingredients = isRecord(root.ingredients) ? root.ingredients : {};

validateAllowedFields(errors, root, ROOT_FIELDS, 'Raíz');
addError(errors, root.schemaVersion === 1, 'schemaVersion debe ser 1');
addError(
  errors,
  root.datasetVersion === 'ingredient-allergens-es-v1',
  'datasetVersion debe ser ingredient-allergens-es-v1',
);
addError(
  errors,
  sameArray(root.supportedExclusions, EXPECTED_EXCLUSIONS),
  'supportedExclusions no coincide con la política v1',
);
addError(
  errors,
  sameArray(root.supportedDiets, EXPECTED_DIETS),
  'supportedDiets no coincide con la política v1',
);
addError(errors, isRecord(root.sources), 'sources debe ser un objeto');
addError(errors, isRecord(root.ingredients), 'ingredients debe ser un objeto');
addError(
  errors,
  Object.keys(ingredients).length === EXPECTED_INGREDIENT_COUNT,
  'ingredients debe contener 399 entradas',
);

validateSources(errors, sources);

for (const name of seedNames) {
  addError(errors, Object.hasOwn(ingredients, name), `Falta ingrediente canónico: ${name}`);
}
for (const [name, profile] of Object.entries(ingredients)) {
  addError(errors, seedSet.has(name), `Ingrediente extra: ${name}`);
  validateIngredient(errors, name, profile, sources);
}

const usedSources = new Set(
  Object.values(ingredients).flatMap((profile) =>
    isRecord(profile) && Array.isArray(profile.sourceIds) ? profile.sourceIds : [],
  ),
);
for (const sourceId of Object.keys(sources)) {
  addError(errors, usedSources.has(sourceId), `Fuente sin uso: ${sourceId}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Dataset de seguridad inválido: ${errors.length} error(es).`);
  process.exitCode = 1;
} else {
  const variableCount = Object.values(ingredients).filter(
    (profile) => profile.compositionStatus === 'variable_unknown',
  ).length;
  console.log(
    `Perfiles de seguridad válidos: ${seedNames.length} ingredientes, ` +
      `${variableCount} preparados variables, ${Object.keys(sources).length} fuentes.`,
  );
}
