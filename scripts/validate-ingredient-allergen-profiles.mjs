import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateJsonKeys } from './lib/find-duplicate-json-keys.mjs';

const EXPECTED_INGREDIENT_COUNT = 331;
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
const REQUIRED_VARIABLE_INGREDIENTS = new Set([
  'chorizo fresco',
  'morcilla de arroz',
  'morcilla de cebolla',
  'salchicha fresca',
  'longaniza',
  'pan de hogaza',
  'pan de barra',
  'pan integral',
  'pan de centeno',
  'pan de molde',
  'pasta espagueti',
  'pasta macarron',
  'pasta tallarines',
  'pasta de sopa',
  'pasta lasana',
  'pan rallado',
  'picos de pan',
  'rosquilletas',
  'tortitas de arroz',
  'fideo cabellin',
  'queso manchego semicurado',
  'queso manchego curado',
  'queso fresco',
  'queso de cabrales',
  'queso tetilla',
  'queso idiazabal',
  'queso mahon',
  'queso burgos',
  'requeson',
  'queso rulo de cabra',
  'queso crema',
  'queso parmesano',
  'queso emmental',
  'queso mozzarella',
  'cuajada',
  'salsa de tomate frito',
  'salsa de tomate triturado',
  'salsa alioli',
  'salsa romesco',
  'salsa brava',
  'salsa vizcaina',
  'salsa de soja',
  'mayonesa',
  'mostaza antigua',
  'mostaza de dijon',
  'salsa perrins',
  'salsa tabasco',
  'salsa agridulce',
  'reduccion de vinagre balsamico',
  'aceite de trufa',
  'salsa barbacoa',
  'salsa pesto',
  'aceite de ajo',
  'salsa picante',
  'pasta de pimiento choricero',
  'aceituna verde',
  'aceituna negra',
  'anchoa en conserva',
  'atun en conserva',
  'sardina en conserva',
  'mejillon en escabeche',
  'berberecho al natural',
  'esparrago blanco',
  'pimiento del piquillo',
  'tomate triturado',
  'tomate frito',
  'concentrado de tomate',
  'garbanzo cocido',
  'lenteja cocida',
  'alubia blanca cocida',
  'caldo de pollo',
  'caldo de pescado',
  'fondo de carne',
]);
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
  addError(
    errors,
    !REQUIRED_VARIABLE_INGREDIENTS.has(name) || isVariable,
    `Ingrediente ${name}: el preparado genérico debe ser variable_unknown`,
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

addError(
  errors,
  seedNames.length === EXPECTED_INGREDIENT_COUNT && seedSet.size === seedNames.length,
  'El seed debe contener 331 normalized_name únicos',
);
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
  'ingredients debe contener 331 entradas',
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
