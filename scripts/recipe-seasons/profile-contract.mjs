export const CLASSIFIER_VERSION = 'culinary-affinity-es-v1';
export const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter', 'all_year'];

const SEASON_SET = new Set(SEASON_KEYS);
const ROOT_FIELDS = new Set([
  'schemaVersion',
  'classifierVersion',
  'generatedAt',
  'profiles',
]);
const PROFILE_FIELDS = new Set([
  'recipeId',
  'title',
  'seasons',
  'confidence',
  'source',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeSeasons(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((season) => typeof season !== 'string' || !SEASON_SET.has(season))) {
    return null;
  }
  if (new Set(value).size !== value.length) return null;
  if (value.includes('all_year') && value.length !== 1) return null;
  return [...value].sort(
    (left, right) => SEASON_KEYS.indexOf(left) - SEASON_KEYS.indexOf(right),
  );
}

export function validateBackfillArtifact(value) {
  const errors = [];
  if (!isRecord(value)) return ['La raíz debe ser un objeto'];
  for (const field of Object.keys(value)) {
    if (!ROOT_FIELDS.has(field)) errors.push(`Raíz: campo no permitido ${field}`);
  }
  if (value.schemaVersion !== 1) errors.push('schemaVersion debe ser 1');
  if (value.classifierVersion !== CLASSIFIER_VERSION) {
    errors.push(`classifierVersion debe ser ${CLASSIFIER_VERSION}`);
  }
  if (
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt))
  ) {
    errors.push('generatedAt debe ser una fecha ISO válida');
  }
  if (!Array.isArray(value.profiles)) {
    errors.push('profiles debe ser un array');
    return errors;
  }

  const ids = new Set();
  for (const [index, profile] of value.profiles.entries()) {
    const path = `profiles[${index}]`;
    if (!isRecord(profile)) {
      errors.push(`${path} debe ser un objeto`);
      continue;
    }
    for (const field of Object.keys(profile)) {
      if (!PROFILE_FIELDS.has(field)) errors.push(`${path}: campo no permitido ${field}`);
    }
    if (typeof profile.recipeId !== 'string' || !UUID_PATTERN.test(profile.recipeId)) {
      errors.push(`${path}.recipeId debe ser un UUID`);
    } else if (ids.has(profile.recipeId)) {
      errors.push(`${path}.recipeId está duplicado`);
    } else {
      ids.add(profile.recipeId);
    }
    if (typeof profile.title !== 'string' || profile.title.trim() === '') {
      errors.push(`${path}.title debe ser un texto no vacío`);
    }
    if (!sanitizeSeasons(profile.seasons)) {
      errors.push(`${path}.seasons no cumple el vocabulario cerrado`);
    }
    if (profile.confidence !== 'low') errors.push(`${path}.confidence debe ser low`);
    if (profile.source !== 'backfill') errors.push(`${path}.source debe ser backfill`);
  }
  return errors;
}
