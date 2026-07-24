import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const validatorPath = join(here, 'validate-ingredient-allergen-profiles.mjs');
const datasetPath = join(
  repoRoot,
  'packages/shared/src/data/ingredient-allergen-profiles.json',
);

function runValidator(fixturePath) {
  return spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      INGREDIENT_ALLERGEN_PROFILES_PATH: fixturePath,
    },
  });
}

function expectFailure(result, expectedMessage, scenario) {
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(
      `${scenario}: se esperaba error con "${expectedMessage}".\nSalida:\n${output}`,
    );
  }
}

async function writeFixture(directory, name, dataset) {
  const path = join(directory, `${name}.json`);
  await writeFile(path, JSON.stringify(dataset));
  return path;
}

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'ingredient-allergen-validator-'));

try {
  const datasetText = await readFile(datasetPath, 'utf8');
  const original = JSON.parse(datasetText);
  const validResult = runValidator(datasetPath);
  if (validResult.status !== 0) {
    throw new Error(`El dataset base debe ser válido.\n${validResult.stdout}${validResult.stderr}`);
  }

  const duplicatePath = join(fixtureDirectory, 'duplicate.json');
  await writeFile(
    duplicatePath,
    datasetText.replace('"schemaVersion": 1,', '"schemaVersion":1,"schemaVersion":1,'),
  );
  expectFailure(
    runValidator(duplicatePath),
    'Clave JSON duplicada: schemaVersion',
    'Clave duplicada',
  );

  const scenarios = [
    {
      name: 'missing-ingredient',
      expected: 'Falta ingrediente canónico: manzana golden',
      mutate(dataset) {
        delete dataset.ingredients['manzana golden'];
      },
    },
    {
      name: 'extra-ingredient',
      expected: 'Ingrediente extra: ingrediente inventado',
      mutate(dataset) {
        dataset.ingredients['ingrediente inventado'] = dataset.ingredients['manzana golden'];
      },
    },
    {
      name: 'missing-allergens',
      expected: 'Ingrediente manzana golden: allergens debe ser un array',
      mutate(dataset) {
        delete dataset.ingredients['manzana golden'].allergens;
      },
    },
    {
      name: 'null-allergens',
      expected: 'Ingrediente manzana golden: allergens debe ser un array',
      mutate(dataset) {
        dataset.ingredients['manzana golden'].allergens = null;
      },
    },
    {
      name: 'duplicate-allergen',
      expected: 'Ingrediente apio: allergens contiene duplicados',
      mutate(dataset) {
        dataset.ingredients.apio.allergens = ['celery', 'celery'];
      },
    },
    {
      name: 'unknown-allergen',
      expected: 'Ingrediente apio: allergens contiene un valor desconocido: sulphites',
      mutate(dataset) {
        dataset.ingredients.apio.allergens = ['sulphites'];
      },
    },
    {
      name: 'unknown-source',
      expected: 'Ingrediente apio: sourceId inexistente fuente-inventada',
      mutate(dataset) {
        dataset.ingredients.apio.sourceIds = ['fuente-inventada'];
      },
    },
    {
      name: 'extra-field',
      expected: 'Ingrediente apio: campo no permitido score',
      mutate(dataset) {
        dataset.ingredients.apio.score = 1;
      },
    },
    {
      name: 'unknown-diet',
      expected: 'Ingrediente apio: incompatibleDiets contiene un valor desconocido: keto',
      mutate(dataset) {
        dataset.ingredients.apio.incompatibleDiets = ['keto'];
      },
    },
    {
      name: 'unknown-composition',
      expected: 'Ingrediente apio: compositionStatus desconocido',
      mutate(dataset) {
        dataset.ingredients.apio.compositionStatus = 'assumed';
      },
    },
    {
      name: 'variable-treated-as-exact',
      expected: 'Ingrediente salsa barbacoa: el preparado genérico debe ser variable_unknown',
      mutate(dataset) {
        const profile = dataset.ingredients['salsa barbacoa'];
        profile.compositionStatus = 'exact_reviewed';
        profile.reviewKind = 'intrinsic_named_ingredient';
        profile.sourceIds = ['catalog-name-review'];
      },
    },
  ];

  for (const scenario of scenarios) {
    const dataset = structuredClone(original);
    scenario.mutate(dataset);
    const path = await writeFixture(fixtureDirectory, scenario.name, dataset);
    expectFailure(runValidator(path), scenario.expected, scenario.name);
  }

  console.log('Pruebas negativas del dataset de seguridad: 12 escenarios correctos.');
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
