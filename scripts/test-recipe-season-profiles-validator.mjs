import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const validatorPath = join(here, 'validate-recipe-season-profiles.mjs');
const datasetPath = join(here, 'seed/recipe-season-profiles.json');
const recipesPath = join(here, 'seed/recipes.json');

function runValidator(fixturePath, recipeFixturePath = recipesPath) {
  return spawnSync(process.execPath, [validatorPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      RECIPE_SEASON_PROFILES_PATH: fixturePath,
      RECIPE_SEED_PATH: recipeFixturePath,
    },
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

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'recipe-seasons-validator-'));

try {
  const datasetText = await readFile(datasetPath, 'utf8');
  const dataset = JSON.parse(datasetText);
  const recipesText = await readFile(recipesPath, 'utf8');

  const duplicateKeyPath = join(fixtureDirectory, 'duplicate-key.json');
  await writeFile(
    duplicateKeyPath,
    datasetText.replace('"schemaVersion": 1,', '"schemaVersion":1,"schemaVersion":1,'),
  );
  requireFailure(
    runValidator(duplicateKeyPath),
    'Clave JSON duplicada: schemaVersion',
    'Clave JSON duplicada',
  );

  const duplicateRecipeKeyPath = join(fixtureDirectory, 'duplicate-recipe-key.json');
  await writeFile(
    duplicateRecipeKeyPath,
    recipesText.replace(
      '"title": "Tortilla de patatas",',
      '"title":"Tortilla de patatas","title":"Tortilla de patatas",',
    ),
  );
  requireFailure(
    runValidator(datasetPath, duplicateRecipeKeyPath),
    'recipes.json: clave JSON duplicada: title',
    'Clave JSON duplicada en recipes.json',
  );

  const duplicateTitlePath = join(fixtureDirectory, 'duplicate-title.json');
  const duplicateTitle = structuredClone(dataset);
  duplicateTitle.profiles[1].title = duplicateTitle.profiles[0].title;
  await writeFile(duplicateTitlePath, JSON.stringify(duplicateTitle));
  requireFailure(
    runValidator(duplicateTitlePath),
    'profiles contiene títulos duplicados',
    'Título duplicado',
  );

  const unknownSeasonPath = join(fixtureDirectory, 'unknown-season.json');
  const unknownSeason = structuredClone(dataset);
  unknownSeason.profiles[0].seasons = ['monsoon'];
  await writeFile(unknownSeasonPath, JSON.stringify(unknownSeason));
  requireFailure(
    runValidator(unknownSeasonPath),
    'seasons contiene valores desconocidos',
    'Estación desconocida',
  );

  const mixedAllYearPath = join(fixtureDirectory, 'mixed-all-year.json');
  const mixedAllYear = structuredClone(dataset);
  mixedAllYear.profiles[0].seasons = ['all_year', 'winter'];
  await writeFile(mixedAllYearPath, JSON.stringify(mixedAllYear));
  requireFailure(
    runValidator(mixedAllYearPath),
    'all_year debe ser exclusivo',
    'all_year combinado',
  );

  const missingProfilePath = join(fixtureDirectory, 'missing-profile.json');
  const missingProfile = structuredClone(dataset);
  missingProfile.profiles.pop();
  await writeFile(missingProfilePath, JSON.stringify(missingProfile));
  requireFailure(
    runValidator(missingProfilePath),
    'profiles debe contener exactamente 24 entradas',
    'Perfil ausente',
  );

  const wrongVersionPath = join(fixtureDirectory, 'wrong-version.json');
  const wrongVersion = structuredClone(dataset);
  wrongVersion.classifierVersion = 'future-v2';
  await writeFile(wrongVersionPath, JSON.stringify(wrongVersion));
  requireFailure(
    runValidator(wrongVersionPath),
    'classifierVersion debe ser culinary-affinity-es-v1',
    'Versión incorrecta',
  );

  console.log('Pruebas negativas del validador estacional: 7 escenarios correctos.');
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
