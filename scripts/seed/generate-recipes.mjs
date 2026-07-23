// Genera un catálogo de recetas por taxonomía (cocina × tipo de comida × dieta) con Gemini
// y las siembra vía la función interna `index-recipe` (que embeddea, deduplica y guarda).
// Re-ejecutable: el dedup del servidor hace seguro correrlo varias veces.
//
// Uso:
//   GEMINI_API_KEY=<key> \
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_ANON_KEY=<anon> \
//   INTERNAL_FUNCTION_SECRET=<secreto> \
//   [RECIPES_PER_CELL=3] [CUISINES="española,italiana"] [THROTTLE_MS=4000] \
//   node scripts/seed/generate-recipes.mjs

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const base = process.env.SUPABASE_FUNCTIONS_URL ?? `${process.env.SUPABASE_URL ?? ''}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
const secret = process.env.INTERNAL_FUNCTION_SECRET;
const perCell = Number(process.env.RECIPES_PER_CELL ?? '3');
// Pausa entre llamadas a Gemini para no reventar el rate limit (free tier ~15 req/min; ten en
// cuenta que cada receta sembrada gasta llamadas extra dentro de index-recipe: embed + resolve).
const throttleMs = Number(process.env.THROTTLE_MS ?? '4000');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!GEMINI_KEY) { console.error('Falta GEMINI_API_KEY.'); process.exit(1); }
if (!process.env.SUPABASE_URL && !process.env.SUPABASE_FUNCTIONS_URL) {
  console.error('Falta SUPABASE_URL (o SUPABASE_FUNCTIONS_URL).'); process.exit(1);
}
if (!anonKey || !secret) { console.error('Faltan SUPABASE_ANON_KEY y/o INTERNAL_FUNCTION_SECRET.'); process.exit(1); }

const GEN_MODEL = 'gemini-flash-lite-latest';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const CUISINES = (process.env.CUISINES ?? [
  'española', 'italiana', 'mexicana', 'japonesa', 'india', 'tailandesa',
  'griega', 'francesa', 'china', 'marroquí', 'peruana', 'estadounidense',
].join(',')).split(',').map((c) => c.trim()).filter(Boolean);
const MEAL_TYPES = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const DIETS = ['omnívora', 'vegetariana', 'vegana'];

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    servings: { type: 'INTEGER' },
    prep_time_min: { type: 'INTEGER' },
    cook_time_min: { type: 'INTEGER' },
    calories: { type: 'INTEGER' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    allergens: { type: 'ARRAY', items: { type: 'STRING' } },
    diet: { type: 'ARRAY', items: { type: 'STRING' } },
    meal_types: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, quantity: { type: 'STRING' }, unit: { type: 'STRING' } },
        required: ['name'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { instruction: { type: 'STRING' }, timer_seconds: { type: 'INTEGER' } },
        required: ['instruction'],
      },
    },
  },
  required: ['title', 'description', 'servings', 'prep_time_min', 'cook_time_min', 'tags', 'allergens', 'diet', 'meal_types', 'ingredients', 'steps'],
};

const BATCH_SCHEMA = {
  type: 'OBJECT',
  properties: { recipes: { type: 'ARRAY', items: RECIPE_SCHEMA } },
  required: ['recipes'],
};

function dietText(diet) {
  if (diet === 'vegana') return 'TODAS deben ser veganas (sin ingredientes de origen animal).';
  if (diet === 'vegetariana') return 'TODAS deben ser vegetarianas (sin carne ni pescado).';
  return 'Pueden incluir carne o pescado.';
}

async function generateCell(cuisine, mealType, diet, n) {
  const prompt =
    `Eres un chef profesional. Crea ${n} recetas DISTINTAS entre sí, realistas y en español, de cocina ` +
    `${cuisine}, pensadas para ${mealType}. ${dietText(diet)} Evita platos genéricos repetidos; busca variedad ` +
    `real (técnicas, ingredientes principales y regiones distintas). Para cada receta usa cantidades concretas, ` +
    `pasos claros y numerados, tiempos y calorías aproximadas, y etiquetas útiles. Añade timer_seconds solo en ` +
    `los pasos con espera o cocción. En "allergens" incluye SOLO las claves de esta lista que la receta contenga ` +
    `realmente: gluten, crustaceans, molluscs, egg, fish, peanut, soy, milk, nuts, celery, mustard, sesame, ` +
    `fructose, histamine, sorbitol, pork, alcohol (vacío si ninguno). En "diet" incluye "vegetarian" si es ` +
    `vegetariana y "vegan" si es vegana (una vegana es también vegetariana: incluye ambas). En "meal_types" usa ` +
    `SOLO estas claves (una receta puede valer para varias) e incluye "${mealType}": desayuno, almuerzo, merienda, cena.`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/models/${GEN_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: BATCH_SCHEMA },
      }),
    });
    // Rate limit: espera creciente y reintenta unas pocas veces antes de rendirse en la celda.
    if (res.status === 429 && attempt < 2) {
      const wait = throttleMs * (attempt + 2);
      console.error(`  429 (rate limit), reintento en ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('Respuesta de generación inesperada de Gemini');
    return JSON.parse(text).recipes ?? [];
  }
}

function parseQuantity(value) {
  if (!value) return null;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

// Mapea la receta de Gemini a la forma de dominio que espera index-recipe/saveRecipe
// (espejo de recipeFromGenerated en _shared/recipes.ts).
function toRecipeData(g) {
  return {
    title: g.title,
    description: g.description ?? '',
    source: 'generated',
    source_url: null,
    servings: g.servings,
    prep_time_min: g.prep_time_min,
    cook_time_min: g.cook_time_min,
    calories: g.calories ?? null,
    tags: g.tags ?? [],
    allergens: g.allergens ?? [],
    diet: g.diet ?? [],
    meal_types: g.meal_types ?? [],
    ingredients: (g.ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: parseQuantity(i.quantity),
      unit: (i.unit ?? '').trim() || null,
      substitutions: [],
    })),
    steps: (g.steps ?? []).map((s, index) => ({
      order: index + 1,
      instruction: s.instruction,
      timerSeconds: typeof s.timer_seconds === 'number' && s.timer_seconds > 0 ? s.timer_seconds : null,
    })),
  };
}

async function seed(recipe) {
  const res = await fetch(`${base}/index-recipe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      'x-internal-secret': secret,
    },
    body: JSON.stringify(recipe),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

let ok = 0, dup = 0, failed = 0, genFailed = 0;
for (const cuisine of CUISINES) {
  for (const mealType of MEAL_TYPES) {
    for (const diet of DIETS) {
      let recipes = [];
      try {
        recipes = await generateCell(cuisine, mealType, diet, perCell);
      } catch (e) {
        genFailed++;
        console.error(`GEN XX ${cuisine}/${mealType}/${diet} -> ${e.message}`);
        continue;
      }
      for (const g of recipes) {
        try {
          const result = await seed(toRecipeData(g));
          if (result.deduped) { dup++; console.log(`DUP ${g.title}`); }
          else { ok++; console.log(`OK  ${g.title} [${cuisine}/${mealType}/${diet}]`); }
        } catch (e) {
          failed++;
          console.error(`XX  ${g.title} -> ${e.message}`);
        }
        await sleep(throttleMs);
      }
      await sleep(throttleMs);
    }
  }
}

console.log(`\n${ok} nuevas, ${dup} duplicadas, ${failed} fallidas, ${genFailed} celdas sin generar.`);
process.exit(failed === 0 && genFailed === 0 ? 0 : 1);
