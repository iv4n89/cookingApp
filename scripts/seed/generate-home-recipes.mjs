// Genera recetas CASERAS (nada de restaurante) por categorías con Gemini y las siembra vía
// index-recipe (embed + dedup + resolve). Controla no-repetición pasando los títulos ya hechos.
// Re-ejecutable: el dedup del servidor lo hace seguro.
//
// Uso (apuntando a la nube):
//   GEMINI_API_KEY=<key> SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<anon> INTERNAL_FUNCTION_SECRET=<secreto> \
//   [BATCH_SIZE=8] [THROTTLE_MS=4000] node scripts/seed/generate-home-recipes.mjs

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const base = process.env.SUPABASE_FUNCTIONS_URL ?? `${process.env.SUPABASE_URL ?? ''}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
const secret = process.env.INTERNAL_FUNCTION_SECRET;
const batchSize = Number(process.env.BATCH_SIZE ?? '8');
const throttleMs = Number(process.env.THROTTLE_MS ?? '4000');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!GEMINI_KEY) { console.error('Falta GEMINI_API_KEY.'); process.exit(1); }
if (!process.env.SUPABASE_URL && !process.env.SUPABASE_FUNCTIONS_URL) {
  console.error('Falta SUPABASE_URL (o SUPABASE_FUNCTIONS_URL).'); process.exit(1);
}
if (!anonKey || !secret) { console.error('Faltan SUPABASE_ANON_KEY y/o INTERNAL_FUNCTION_SECRET.'); process.exit(1); }

const GEN_MODEL = 'gemini-flash-lite-latest';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' }, description: { type: 'STRING' },
    servings: { type: 'INTEGER' }, prep_time_min: { type: 'INTEGER' },
    cook_time_min: { type: 'INTEGER' }, calories: { type: 'INTEGER' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    allergens: { type: 'ARRAY', items: { type: 'STRING' } },
    diet: { type: 'ARRAY', items: { type: 'STRING' } },
    meal_types: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: { type: 'ARRAY', items: { type: 'OBJECT',
      properties: { name: { type: 'STRING' }, quantity: { type: 'STRING' }, unit: { type: 'STRING' } }, required: ['name'] } },
    steps: { type: 'ARRAY', items: { type: 'OBJECT',
      properties: { instruction: { type: 'STRING' }, timer_seconds: { type: 'INTEGER' } }, required: ['instruction'] } },
  },
  required: ['title', 'description', 'servings', 'prep_time_min', 'cook_time_min', 'tags', 'allergens', 'diet', 'meal_types', 'ingredients', 'steps'],
};
const BATCH_SCHEMA = { type: 'OBJECT', properties: { recipes: { type: 'ARRAY', items: RECIPE_SCHEMA } }, required: ['recipes'] };

const CASERO =
  'Son recetas CASERAS, de cocina de casa de toda la vida: nada de platos de restaurante, alta cocina, ' +
  'emplatados sofisticados ni técnicas de chef. Platos reales que cocina la gente en su casa. ' +
  'Usa cantidades concretas, pasos claros y numerados, tiempos y calorías aproximadas y etiquetas útiles. ' +
  'Añade timer_seconds solo en pasos con espera o cocción. En "allergens" incluye SOLO las claves que la ' +
  'receta contenga realmente: gluten, crustaceans, molluscs, egg, fish, peanut, soy, milk, nuts, celery, ' +
  'mustard, sesame, fructose, histamine, sorbitol, pork, alcohol (vacío si ninguno). En "diet": "vegetarian" ' +
  'si es vegetariana y "vegan" si es vegana (una vegana también es vegetariana: incluye ambas; vacío si lleva ' +
  'carne o pescado). En "meal_types" usa SOLO: desayuno, almuerzo, merienda, cena (una receta puede valer para varias).';

const CATEGORIES = [
  { key: 'España', count: 100,
    focus: 'platos caseros tradicionales españoles de DISTINTAS comunidades autónomas (Andalucía, Cataluña, ' +
      'Galicia, País Vasco, Comunidad Valenciana, Castilla y León, Castilla-La Mancha, Madrid, Asturias, Aragón, ' +
      'Extremadura, Murcia, Canarias, Islas Baleares, Navarra, La Rioja, Cantabria), bien repartidos por regiones',
    seedTitles: ['Serranito'] },
  { key: 'Europa', count: 100,
    focus: 'platos caseros tradicionales de países europeos que NO sean España (Italia, Francia, Portugal, Grecia, ' +
      'Alemania, Reino Unido, Irlanda, Polonia, Hungría, Bélgica, Países Bajos, Suecia, Austria, Suiza, Rumanía, ' +
      'Rusia, Ucrania), variados por país' },
  { key: 'Latinoamérica', count: 100,
    focus: 'platos caseros tradicionales latinoamericanos (México, Perú, Argentina, Colombia, Chile, Venezuela, ' +
      'Brasil, Cuba, Ecuador, Bolivia, Uruguay, Paraguay, Guatemala, República Dominicana), variados por país' },
  { key: 'Asia', count: 100,
    focus: 'platos caseros tradicionales asiáticos (China, Japón, India, Tailandia, Vietnam, Corea, Indonesia, ' +
      'Filipinas, Malasia, Nepal, Sri Lanka), variados por país' },
  { key: 'Norteamérica', count: 20,
    focus: 'platos caseros tradicionales de Estados Unidos y Canadá (comfort food de casa, no de restaurante)' },
];

async function generateBatch(category, avoid, n, forceTitles) {
  const avoidText = avoid.length
    ? ` NO repitas NINGUNO de estos platos ya generados (ni variantes casi idénticas): ${avoid.join('; ')}.`
    : '';
  const forceText = forceTitles && forceTitles.length
    ? ` Incluye OBLIGATORIAMENTE en este lote estos platos: ${forceTitles.join('; ')} (versión casera).`
    : '';
  const prompt =
    `Eres una cocinera de casa. Crea ${n} recetas DISTINTAS entre sí, realistas y en español, de ${category.focus}. ` +
    `${CASERO}${forceText}${avoidText}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/models/${GEN_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: BATCH_SCHEMA } }),
    });
    if (res.status === 429 && attempt < 3) {
      const wait = throttleMs * (attempt + 2);
      console.error(`  429 rate limit, reintento en ${wait}ms...`); await sleep(wait); continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('Respuesta inesperada de Gemini');
    return JSON.parse(text).recipes ?? [];
  }
}

const parseQuantity = (v) => { if (!v) return null; const n = Number(String(v).replace(',', '.').trim()); return Number.isFinite(n) ? n : null; };
const toRecipeData = (g) => ({
  title: g.title, description: g.description ?? '', source: 'generated', source_url: null,
  servings: g.servings, prep_time_min: g.prep_time_min, cook_time_min: g.cook_time_min, calories: g.calories ?? null,
  tags: g.tags ?? [], allergens: g.allergens ?? [], diet: g.diet ?? [], meal_types: g.meal_types ?? [],
  ingredients: (g.ingredients ?? []).map((i) => ({ name: i.name, quantity: parseQuantity(i.quantity), unit: (i.unit ?? '').trim() || null, substitutions: [] })),
  steps: (g.steps ?? []).map((s, index) => ({ order: index + 1, instruction: s.instruction, timerSeconds: typeof s.timer_seconds === 'number' && s.timer_seconds > 0 ? s.timer_seconds : null })),
});

async function seed(recipe) {
  const res = await fetch(`${base}/index-recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, 'x-internal-secret': secret },
    body: JSON.stringify(recipe),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

const limit = Number(process.env.CATEGORY_LIMIT ?? '0'); // para pruebas: cap por categoría
let totalOk = 0, totalDup = 0, totalFailed = 0;
for (const category of CATEGORIES) {
  if (limit > 0) category.count = Math.min(category.count, limit);
  const seen = [];
  let ok = 0, attempts = 0;
  const maxAttempts = Math.ceil(category.count / batchSize) * 3 + 4; // límite para no bucle infinito si el dedup es alto
  console.log(`\n=== ${category.key}: objetivo ${category.count} ===`);
  let force = category.seedTitles ?? null;
  while (ok < category.count && attempts < maxAttempts) {
    attempts++;
    const need = Math.min(batchSize, category.count - ok);
    let recipes = [];
    try { recipes = await generateBatch(category, seen.slice(-120), need, force); }
    catch (e) { console.error(`  GEN XX -> ${e.message}`); await sleep(throttleMs * 2); continue; }
    force = null; // solo forzar en el primer lote
    for (const g of recipes) {
      if (!g?.title) continue;
      seen.push(g.title);
      try {
        const result = await seed(toRecipeData(g));
        if (result.deduped) { totalDup++; console.log(`  DUP ${g.title}`); }
        else { ok++; totalOk++; console.log(`  OK  [${ok}/${category.count}] ${g.title}`); }
      } catch (e) { totalFailed++; console.error(`  XX  ${g.title} -> ${e.message}`); }
      await sleep(throttleMs);
      if (ok >= category.count) break;
    }
    await sleep(throttleMs);
  }
  console.log(`--- ${category.key}: ${ok} sembradas (${attempts} lotes)`);
}
console.log(`\nTOTAL: ${totalOk} nuevas, ${totalDup} duplicadas, ${totalFailed} fallidas.`);
