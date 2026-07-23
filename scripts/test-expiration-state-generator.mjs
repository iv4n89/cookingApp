import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const generatorPath = join(here, 'generate-expiration-state-migration.mjs');
const datasetPath = join(
  repoRoot,
  'packages/shared/src/data/ingredient-expiration-profiles.json',
);
const seedPath = join(repoRoot, 'supabase/migrations/0007_ingredients_seed.sql');

function runGenerator({ dataset, migration, args = [] }) {
  return spawnSync(process.execPath, [generatorPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPIRATION_PROFILES_PATH: dataset,
      EXPIRATION_MIGRATION_PATH: migration,
      EXPIRATION_SEED_PATH: seedPath,
    },
  });
}

function requireSuccess(result, scenario) {
  if (result.status !== 0) {
    throw new Error(`${scenario}:\n${result.stdout}${result.stderr}`);
  }
}

function requireFailure(result, expectedMessage, scenario) {
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(`${scenario}: se esperaba "${expectedMessage}".\n${output}`);
  }
}

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'expiration-generator-'));

try {
  const originalDatasetText = await readFile(datasetPath, 'utf8');
  const fixtureDataset = join(fixtureDirectory, 'profiles.json');
  const fixtureMigration = join(fixtureDirectory, '0049.sql');
  await writeFile(fixtureDataset, originalDatasetText);

  requireSuccess(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'Generación inicial',
  );
  requireSuccess(
    runGenerator({
      dataset: fixtureDataset,
      migration: fixtureMigration,
      args: ['--check'],
    }),
    'Verificación reproducible',
  );

  const generatedSql = await readFile(fixtureMigration, 'utf8');
  if (
    !generatedSql.includes('se esperaban 96 perfiles') ||
    !generatedSql.includes('se esperaban 331 ingredientes') ||
    !generatedSql.includes('min_days is not null') ||
    !generatedSql.includes('max_days is not null') ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
      generatedSql,
    )
  ) {
    throw new Error(
      'La salida no conserva los recuentos/constraints o contiene un UUID hardcodeado.',
    );
  }

  const changedDataset = JSON.parse(originalDatasetText);
  changedDataset.profiles['fruit-apple'].minDays = 27;
  await writeFile(fixtureDataset, JSON.stringify(changedDataset));
  requireFailure(
    runGenerator({
      dataset: fixtureDataset,
      migration: fixtureMigration,
      args: ['--check'],
    }),
    'no coincide con el dataset',
    'Checksum o contenido divergente',
  );

  const unknownIngredientDataset = JSON.parse(originalDatasetText);
  const knownMapping = unknownIngredientDataset.ingredients['manzana golden'];
  delete unknownIngredientDataset.ingredients['manzana golden'];
  unknownIngredientDataset.ingredients['ingrediente inexistente'] = knownMapping;
  await writeFile(fixtureDataset, JSON.stringify(unknownIngredientDataset));
  requireFailure(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'fuera del seed',
    'Ingrediente inexistente',
  );

  const duplicateDatasetText = originalDatasetText.replace(
    '"schemaVersion": 1,',
    '"schemaVersion":1,"schemaVersion":1,',
  );
  await writeFile(fixtureDataset, duplicateDatasetText);
  requireFailure(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'claves duplicadas',
    'Clave JSON duplicada',
  );

  const quotedDataset = JSON.parse(originalDatasetText);
  quotedDataset.profiles['fruit-apple'].sourceRef = "L'utilisateur";
  await writeFile(fixtureDataset, JSON.stringify(quotedDataset));
  requireSuccess(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'Escape de comilla SQL',
  );
  const quotedSql = await readFile(fixtureMigration, 'utf8');
  if (!quotedSql.includes("L''utilisateur")) {
    throw new Error('La comilla simple no se escapó para SQL.');
  }

  console.log('Pruebas del generador de migración: 5 escenarios correctos.');
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
