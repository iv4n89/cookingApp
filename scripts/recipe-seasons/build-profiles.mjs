// Construye un artefacto local para revisión humana. Lee recetas reutilizables sin perfil,
// las clasifica con Gemini y nunca escribe en la base de datos.
//
// SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> GEMINI_API_KEY=<key> \
//   node scripts/recipe-seasons/build-profiles.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSIFIER_VERSION,
  SEASON_KEYS,
  sanitizeSeasons,
  validateBackfillArtifact,
} from './profile-contract.mjs';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!url || !serviceKey || !geminiKey) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y/o GEMINI_API_KEY.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.RECIPE_SEASON_OUTPUT_PATH ??
  join(here, 'profiles.local.json');
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};
const model = 'gemini-flash-lite-latest';
const batchSize = 20;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    profiles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          recipeId: { type: 'STRING' },
          seasons: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: SEASON_KEYS },
          },
        },
        required: ['recipeId', 'seasons'],
      },
    },
  },
  required: ['profiles'],
};

async function getAll(path) {
  const rows = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let offset = 0;; offset += 1000) {
    const pagedPath = `${path}${separator}limit=1000&offset=${offset}`;
    const response = await fetch(`${rest}/${pagedPath}`, { headers });
    if (!response.ok) {
      throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function classify(recipes) {
  const prompt =
    `Clasifica la afinidad culinaria estacional de cada receta para el clima y hábitos de España. ` +
    `Evalúa la experiencia del plato (fresco, reconfortante, de cuchara, etc.), NO la temporada ` +
    `de sus ingredientes. Usa solo ${SEASON_KEYS.join(', ')}. all_year se usa únicamente cuando ` +
    `no existe afinidad clara y nunca se combina con otra estación. Devuelve exactamente una ` +
    `entrada por recipeId.\n\n` +
    recipes
      .map((recipe) =>
        `${recipe.id} | ${recipe.title} | ${recipe.description ?? ''} | ${(recipe.tags ?? []).join(', ')}`
      )
      .join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Respuesta inesperada de Gemini');
  return JSON.parse(text).profiles;
}

const [recipes, existingProfiles] = await Promise.all([
  getAll('recipes?select=id,title,description,tags&reusable=eq.true&order=id'),
  getAll('recipe_season_profiles?select=recipe_id'),
]);
const classifiedIds = new Set(existingProfiles.map((profile) => profile.recipe_id));
const pending = recipes.filter((recipe) => !classifiedIds.has(recipe.id));
const titleById = new Map(pending.map((recipe) => [recipe.id, recipe.title]));
const profiles = [];

for (let start = 0; start < pending.length; start += batchSize) {
  const batch = pending.slice(start, start + batchSize);
  const responseProfiles = await classify(batch);
  const batchIds = new Set(batch.map((recipe) => recipe.id));
  if (
    responseProfiles.length !== batch.length ||
    new Set(responseProfiles.map((profile) => profile.recipeId)).size !== batch.length ||
    responseProfiles.some((profile) => !batchIds.has(profile.recipeId))
  ) {
    throw new Error(`Gemini no devolvió exactamente el lote ${start / batchSize + 1}`);
  }
  for (const profile of responseProfiles) {
    const seasons = sanitizeSeasons(profile.seasons);
    if (!seasons) throw new Error(`Perfil inválido devuelto para ${profile.recipeId}`);
    profiles.push({
      recipeId: profile.recipeId,
      title: titleById.get(profile.recipeId),
      seasons,
      confidence: 'low',
      source: 'backfill',
    });
  }
  console.log(`Clasificadas ${Math.min(start + batchSize, pending.length)}/${pending.length}`);
}

const artifact = {
  schemaVersion: 1,
  classifierVersion: CLASSIFIER_VERSION,
  generatedAt: new Date().toISOString(),
  profiles,
};
const errors = validateBackfillArtifact(artifact);
if (errors.length > 0) throw new Error(errors.join('\n'));
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Artefacto de revisión escrito en ${outputPath}: ${profiles.length} perfiles.`);
