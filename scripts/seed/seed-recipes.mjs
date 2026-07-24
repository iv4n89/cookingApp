// Siembra el catálogo con la tanda de recetas de recipes.json a través de la función
// interna `index-recipe` (calcula embedding, enlaza ingredientes y encola la imagen).
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<anon-key> \
//   INTERNAL_FUNCTION_SECRET=<secreto> \
//   node scripts/seed/seed-recipes.mjs
//
// Nota: el dedup vive en index-recipe (find_similar_recipe); re-ejecutar es seguro y no duplica.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const base = process.env.SUPABASE_FUNCTIONS_URL ?? `${process.env.SUPABASE_URL ?? ''}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
const secret = process.env.INTERNAL_FUNCTION_SECRET;

if (!process.env.SUPABASE_URL && !process.env.SUPABASE_FUNCTIONS_URL) {
  console.error('Falta SUPABASE_URL (o SUPABASE_FUNCTIONS_URL).');
  process.exit(1);
}
if (!anonKey || !secret) {
  console.error('Faltan SUPABASE_ANON_KEY y/o INTERNAL_FUNCTION_SECRET.');
  process.exit(1);
}

const recipes = JSON.parse(await readFile(join(here, 'recipes.json'), 'utf8'));
const seasonDataset = JSON.parse(
  await readFile(join(here, 'recipe-season-profiles.json'), 'utf8'),
);
const seasonProfiles = new Map(
  seasonDataset.profiles.map((profile) => [profile.title, {
    seasons: profile.seasons,
    confidence: profile.confidence,
    source: profile.source,
    classifierVersion: seasonDataset.classifierVersion,
  }]),
);
if (
  seasonProfiles.size !== recipes.length ||
  recipes.some((recipe) => !seasonProfiles.has(recipe.title))
) {
  throw new Error('Los perfiles estacionales no coinciden exactamente con recipes.json');
}
const endpoint = `${base}/index-recipe`;

let ok = 0;
let failed = 0;

for (const recipe of recipes) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        'x-internal-secret': secret,
      },
      body: JSON.stringify({
        ...recipe,
        seasonProfile: seasonProfiles.get(recipe.title),
      }),
    });
    if (res.ok) {
      ok++;
      console.log(`OK  ${recipe.title}`);
    } else {
      failed++;
      console.error(`XX  ${recipe.title} -> ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    failed++;
    console.error(`XX  ${recipe.title} -> ${e.message}`);
  }
}

console.log(`\n${ok} sembradas, ${failed} fallidas de ${recipes.length}.`);
process.exit(failed === 0 ? 0 : 1);
