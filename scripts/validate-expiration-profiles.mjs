import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_CANONICAL_COUNT = 331;
const MATCH_TYPES = new Set(['direct', 'family', 'fallback']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const ROOT_FIELDS = new Set(['schemaVersion', 'catalog', 'sources', 'profiles', 'ingredients']);
const CATALOG_FIELDS = new Set(['source', 'canonicalCount']);
const SOURCE_FIELDS = new Set([
  'title',
  'url',
  'archivedUrl',
  'license',
  'contentVersion',
  'contentModifiedAt',
  'catalogUpdatedAt',
  'retrievedAt',
  'sha256',
]);
const PROFILE_FIELDS = new Set([
  'minDays',
  'maxDays',
  'confidence',
  'sourceId',
  'sourceRef',
  'priorityEligible',
]);
const INGREDIENT_FIELDS = new Set(['profileId', 'match']);
const TUPLE_PATTERN =
  /^\s*\('(?:[^']|'')*',\s*'((?:[^']|'')*)',\s*'(?:[^']|'')*'\)[,;]?\s*$/;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const migrationPath = join(repoRoot, 'supabase/migrations/0007_ingredients_seed.sql');
const datasetPath = join(
  repoRoot,
  'packages/shared/src/data/ingredient-expiration-profiles.json',
);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireCondition(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateAllowedFields(errors, record, allowedFields, path) {
  for (const field of Object.keys(record)) {
    requireCondition(errors, allowedFields.has(field), `${path}: campo no permitido ${field}`);
  }
}

function findDuplicateMapKeys(jsonText, sectionName) {
  const lines = jsonText.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  "${sectionName}": {`);
  if (start === -1) return [];

  const seen = new Set();
  const duplicates = new Set();
  for (const line of lines.slice(start + 1)) {
    if (/^  }[,]?$/.test(line)) break;
    const match = line.match(/^    ("(?:[^"\\]|\\.)+"): \{$/);
    if (!match) continue;

    const key = JSON.parse(match[1]);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function parseCanonicalNames(migrationText) {
  const tupleLines = migrationText
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trimStart().startsWith("('"));

  return tupleLines.map(({ line, lineNumber }) => {
    const match = line.match(TUPLE_PATTERN);
    if (!match) {
      throw new Error(`Tupla no reconocida en ${migrationPath}:${lineNumber}`);
    }
    return match[1].replaceAll("''", "'");
  });
}

function validateSources(errors, sources) {
  for (const [sourceId, source] of Object.entries(sources)) {
    requireCondition(errors, isRecord(source), `Fuente inválida: ${sourceId}`);
    if (!isRecord(source)) continue;
    validateAllowedFields(errors, source, SOURCE_FIELDS, `Fuente ${sourceId}`);

    for (const field of ['title', 'url', 'retrievedAt']) {
      requireCondition(
        errors,
        typeof source[field] === 'string' && source[field].trim() !== '',
        `Fuente ${sourceId}: ${field} debe ser un texto no vacío`,
      );
    }
  }
}

function validateProfiles(errors, profiles, sources) {
  for (const [profileId, profile] of Object.entries(profiles)) {
    requireCondition(errors, isRecord(profile), `Perfil inválido: ${profileId}`);
    if (!isRecord(profile)) continue;
    validateAllowedFields(errors, profile, PROFILE_FIELDS, `Perfil ${profileId}`);

    const hasNumericRange =
      Number.isInteger(profile.minDays) &&
      profile.minDays > 0 &&
      Number.isInteger(profile.maxDays) &&
      profile.maxDays > 0 &&
      profile.minDays <= profile.maxDays;
    const hasIndefiniteRange =
      profile.minDays === null &&
      profile.maxDays === null &&
      profile.priorityEligible === false;

    requireCondition(
      errors,
      hasNumericRange || hasIndefiniteRange,
      `Perfil ${profileId}: rango inválido`,
    );
    requireCondition(
      errors,
      CONFIDENCE_LEVELS.has(profile.confidence),
      `Perfil ${profileId}: confidence inválido`,
    );
    requireCondition(
      errors,
      typeof profile.sourceId === 'string' && Object.hasOwn(sources, profile.sourceId),
      `Perfil ${profileId}: sourceId inexistente`,
    );
    requireCondition(
      errors,
      typeof profile.sourceRef === 'string' && profile.sourceRef.trim() !== '',
      `Perfil ${profileId}: sourceRef debe ser un texto no vacío`,
    );
    requireCondition(
      errors,
      typeof profile.priorityEligible === 'boolean',
      `Perfil ${profileId}: priorityEligible debe ser boolean`,
    );
  }
}

function validateIngredients(errors, ingredients, profiles, canonicalNames) {
  const canonicalSet = new Set(canonicalNames);
  const ingredientNames = Object.keys(ingredients);
  const ingredientSet = new Set(ingredientNames);

  for (const name of canonicalNames) {
    requireCondition(errors, ingredientSet.has(name), `Falta ingrediente canónico: ${name}`);
  }
  for (const name of ingredientNames) {
    requireCondition(errors, canonicalSet.has(name), `Ingrediente extra: ${name}`);
  }

  const usedProfiles = new Set();
  for (const [name, ingredient] of Object.entries(ingredients)) {
    requireCondition(errors, isRecord(ingredient), `Ingrediente inválido: ${name}`);
    if (!isRecord(ingredient)) continue;
    validateAllowedFields(errors, ingredient, INGREDIENT_FIELDS, `Ingrediente ${name}`);

    const profileExists =
      typeof ingredient.profileId === 'string' && Object.hasOwn(profiles, ingredient.profileId);
    requireCondition(errors, profileExists, `Ingrediente ${name}: profileId inexistente`);
    requireCondition(
      errors,
      MATCH_TYPES.has(ingredient.match),
      `Ingrediente ${name}: match inválido`,
    );
    if (profileExists) usedProfiles.add(ingredient.profileId);
  }

  for (const profileId of Object.keys(profiles)) {
    requireCondition(errors, usedProfiles.has(profileId), `Perfil sin uso: ${profileId}`);
  }
}

const migrationText = await readFile(migrationPath, 'utf8');
const canonicalNames = parseCanonicalNames(migrationText);
const canonicalSet = new Set(canonicalNames);

if (
  canonicalNames.length !== EXPECTED_CANONICAL_COUNT ||
  canonicalSet.size !== canonicalNames.length
) {
  throw new Error(
    `Catálogo inválido: ${canonicalNames.length} filas, ${canonicalSet.size} nombres únicos`,
  );
}

let dataset;
let datasetText;
try {
  datasetText = await readFile(datasetPath, 'utf8');
  dataset = JSON.parse(datasetText);
} catch (error) {
  console.error(`No se pudo leer ${datasetPath}: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

const errors = [];
requireCondition(errors, isRecord(dataset), 'La raíz debe ser un objeto');

const root = isRecord(dataset) ? dataset : {};
const catalog = isRecord(root.catalog) ? root.catalog : {};
const sources = isRecord(root.sources) ? root.sources : {};
const profiles = isRecord(root.profiles) ? root.profiles : {};
const ingredients = isRecord(root.ingredients) ? root.ingredients : {};

validateAllowedFields(errors, root, ROOT_FIELDS, 'Raíz');
validateAllowedFields(errors, catalog, CATALOG_FIELDS, 'Catálogo');
for (const sectionName of ['sources', 'profiles', 'ingredients']) {
  for (const key of findDuplicateMapKeys(datasetText, sectionName)) {
    errors.push(`${sectionName}: clave JSON duplicada ${key}`);
  }
}

requireCondition(errors, root.schemaVersion === 1, 'schemaVersion debe ser 1');
requireCondition(errors, isRecord(root.catalog), 'catalog debe ser un objeto');
requireCondition(errors, isRecord(root.sources), 'sources debe ser un objeto');
requireCondition(errors, isRecord(root.profiles), 'profiles debe ser un objeto');
requireCondition(errors, isRecord(root.ingredients), 'ingredients debe ser un objeto');
requireCondition(
  errors,
  catalog.source === 'supabase/migrations/0007_ingredients_seed.sql',
  'catalog.source no coincide con la migración autoritativa',
);
requireCondition(
  errors,
  catalog.canonicalCount === canonicalNames.length,
  `catalog.canonicalCount debe ser ${canonicalNames.length}`,
);
requireCondition(
  errors,
  Object.keys(ingredients).length === canonicalNames.length,
  `ingredients debe contener ${canonicalNames.length} entradas`,
);

validateSources(errors, sources);
validateProfiles(errors, profiles, sources);
validateIngredients(errors, ingredients, profiles, canonicalNames);

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Dataset de caducidad inválido: ${errors.length} error(es).`);
  process.exitCode = 1;
} else {
  console.log(
    `Perfiles de caducidad válidos: ${canonicalNames.length} ingredientes, ` +
      `${Object.keys(profiles).length} perfiles, ${Object.keys(sources).length} fuentes.`,
  );
}
