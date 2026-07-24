import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const generatorPath = join(here, 'generate-ingredient-allergen-migration.mjs');
const datasetPath = join(
  repoRoot,
  'packages/shared/src/data/ingredient-allergen-profiles.json',
);

function runGenerator({ dataset, migration, check = false }) {
  return spawnSync(process.execPath, [generatorPath, ...(check ? ['--check'] : [])], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      INGREDIENT_ALLERGEN_PROFILES_PATH: dataset,
      INGREDIENT_ALLERGEN_MIGRATION_PATH: migration,
    },
  });
}

function expectSuccess(result, scenario) {
  if (result.status !== 0) {
    throw new Error(`${scenario}: debía finalizar correctamente.\n${result.stdout}${result.stderr}`);
  }
}

function expectFailure(result, expectedMessage, scenario) {
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(
      `${scenario}: se esperaba error con "${expectedMessage}".\nSalida:\n${output}`,
    );
  }
}

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'ingredient-allergen-generator-'));
const fixtureDataset = join(fixtureDirectory, 'profiles.json');
const fixtureMigration = join(fixtureDirectory, 'migration.sql');

try {
  const originalText = await readFile(datasetPath, 'utf8');
  const original = JSON.parse(originalText);
  await writeFile(fixtureDataset, originalText);

  expectSuccess(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'Generación base',
  );
  expectSuccess(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration, check: true }),
    'Check reproducible',
  );

  const generatedSql = await readFile(fixtureMigration, 'utf8');
  if (!generatedSql.includes('-- profile-count: 331')) {
    throw new Error('La migración no declara los 331 perfiles.');
  }
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(generatedSql)) {
    throw new Error('La migración contiene un UUID hardcodeado.');
  }
  if (!generatedSql.includes("'variable_unknown'")) {
    throw new Error('La migración perdió el estado variable_unknown.');
  }
  if (!generatedSql.includes("('leche entera', 'vegan')")) {
    throw new Error('La migración perdió las incompatibilidades dietéticas.');
  }

  await writeFile(fixtureMigration, `${generatedSql}\n-- divergencia\n`);
  expectFailure(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration, check: true }),
    'no coincide con el dataset',
    'Divergencia byte a byte',
  );

  const unknownIngredient = structuredClone(original);
  unknownIngredient.ingredients['ingrediente inexistente'] =
    unknownIngredient.ingredients['manzana golden'];
  delete unknownIngredient.ingredients['manzana golden'];
  await writeFile(fixtureDataset, JSON.stringify(unknownIngredient));
  expectFailure(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'Ingrediente extra: ingrediente inexistente',
    'Ingrediente inexistente',
  );

  await writeFile(
    fixtureDataset,
    originalText.replace('"schemaVersion": 1,', '"schemaVersion":1,"schemaVersion":1,'),
  );
  expectFailure(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'Clave JSON duplicada: schemaVersion',
    'Clave JSON duplicada',
  );

  const quotedDataset = structuredClone(original);
  quotedDataset.ingredients['manzana golden'].sourceRef = "L'utilisateur";
  await writeFile(fixtureDataset, JSON.stringify(quotedDataset));
  expectSuccess(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'Escape de comilla',
  );
  const quotedSql = await readFile(fixtureMigration, 'utf8');
  if (!quotedSql.includes("L''utilisateur")) {
    throw new Error('La comilla simple no se escapó para SQL.');
  }

  const unknownDiet = structuredClone(original);
  unknownDiet.ingredients.apio.incompatibleDiets = ['keto'];
  await writeFile(fixtureDataset, JSON.stringify(unknownDiet));
  expectFailure(
    runGenerator({ dataset: fixtureDataset, migration: fixtureMigration }),
    'incompatibleDiets contiene un valor desconocido: keto',
    'Dieta desconocida',
  );

  console.log('Pruebas del generador de seguridad: 9 contratos correctos.');
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
