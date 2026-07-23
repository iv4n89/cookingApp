import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const validatorPath = join(here, 'validate-expiration-profiles.mjs');
const datasetPath = join(
  repoRoot,
  'packages/shared/src/data/ingredient-expiration-profiles.json',
);

function runValidator(fixturePath) {
  return spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, EXPIRATION_PROFILES_PATH: fixturePath },
  });
}

function requireFailure(result, expectedMessage, scenario) {
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(
      `${scenario}: se esperaba error con "${expectedMessage}".\nSalida:\n${output}`,
    );
  }
}

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'expiration-validator-'));

try {
  const datasetText = await readFile(datasetPath, 'utf8');

  const duplicateFixture = join(fixtureDirectory, 'duplicate.json');
  const duplicateText = datasetText.replace(
    '"schemaVersion": 1,',
    '"schemaVersion":1,"schemaVersion":1,',
  );
  await writeFile(duplicateFixture, duplicateText);
  requireFailure(
    runValidator(duplicateFixture),
    'Clave JSON duplicada: schemaVersion',
    'Clave duplicada sin formato canónico',
  );

  const invalidReferenceFixture = join(fixtureDirectory, 'invalid-reference.json');
  const invalidReferenceDataset = JSON.parse(datasetText);
  invalidReferenceDataset.profiles['fruit-apple'].sourceRef = 'referencia libre no verificable';
  await writeFile(invalidReferenceFixture, JSON.stringify(invalidReferenceDataset));
  requireFailure(
    runValidator(invalidReferenceFixture),
    'sourceRef incompatible con foodkeeper-es',
    'Referencia incompatible en JSON minificado',
  );

  console.log('Pruebas negativas del validador de caducidad: 2 escenarios correctos.');
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
