import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLASSIFIER_VERSION,
  sanitizeSeasons,
  validateBackfillArtifact,
} from './profile-contract.mjs';

function validArtifact() {
  return {
    schemaVersion: 1,
    classifierVersion: CLASSIFIER_VERSION,
    generatedAt: '2026-07-24T10:00:00.000Z',
    profiles: [{
      recipeId: '00000000-0000-4000-8000-000000000001',
      title: 'Sopa de prueba',
      seasons: ['winter'],
      confidence: 'low',
      source: 'backfill',
    }],
  };
}

test('sanitizes valid seasons into stable order', () => {
  assert.deepEqual(sanitizeSeasons(['winter', 'spring']), ['spring', 'winter']);
});

test('rejects an invalid season profile as a whole', () => {
  assert.equal(sanitizeSeasons(['all_year', 'winter']), null);
  assert.equal(sanitizeSeasons(['summer', 'summer']), null);
  assert.equal(sanitizeSeasons(['monsoon']), null);
});

test('accepts a complete backfill artifact', () => {
  assert.deepEqual(validateBackfillArtifact(validArtifact()), []);
});

test('accumulates invalid provenance, identity and vocabulary errors', () => {
  const artifact = validArtifact();
  artifact.profiles[0] = {
    recipeId: 'not-a-uuid',
    title: '',
    seasons: ['all_year', 'winter'],
    confidence: 'high',
    source: 'curated',
  };

  const errors = validateBackfillArtifact(artifact);
  assert.equal(errors.length, 5);
  assert.ok(errors.some((error) => error.includes('recipeId debe ser un UUID')));
  assert.ok(errors.some((error) => error.includes('seasons no cumple')));
  assert.ok(errors.some((error) => error.includes('confidence debe ser low')));
  assert.ok(errors.some((error) => error.includes('source debe ser backfill')));
});

test('rejects duplicated recipe ids before any apply step', () => {
  const artifact = validArtifact();
  artifact.profiles.push({ ...artifact.profiles[0], title: 'Otra receta' });
  assert.ok(
    validateBackfillArtifact(artifact).some((error) => error.includes('recipeId está duplicado')),
  );
});
