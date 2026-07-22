// Backfill one-off: clasifica en meal_types (desayuno/almuerzo/merienda/cena) las recetas
// del pool que aún no lo tengan. No forma parte del runtime.
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   GEMINI_API_KEY=<key> \
//   node scripts/backfill-meal-types.mjs

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!url || !serviceKey || !geminiKey) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y/o GEMINI_API_KEY.');
  process.exit(1);
}

const MEAL_TYPE_KEYS = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const GEN_MODEL = 'gemini-flash-lite-latest';
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const SCHEMA = {
  type: 'OBJECT',
  properties: { meal_types: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['meal_types'],
};

async function classify(recipe) {
  const prompt =
    `Clasifica en qué momentos del día encaja este plato español. Usa SOLO estas claves ` +
    `(una receta puede valer para varias): desayuno, almuerzo, merienda, cena.\n` +
    `Título: ${recipe.title}\nDescripción: ${recipe.description ?? ''}\n` +
    `Etiquetas: ${(recipe.tags ?? []).join(', ')}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text);
  const seen = new Set(MEAL_TYPE_KEYS);
  return [...new Set((parsed.meal_types ?? []).map((m) => String(m).toLowerCase().trim()))].filter((m) =>
    seen.has(m),
  );
}

const listRes = await fetch(
  `${rest}/recipes?select=id,title,description,tags&meal_types=eq.{}`,
  { headers },
);
if (!listRes.ok) {
  console.error(`No se pudieron leer recetas: ${listRes.status} ${await listRes.text()}`);
  process.exit(1);
}
const recipes = await listRes.json();
console.log(`Recetas por clasificar: ${recipes.length}`);

let ok = 0;
let failed = 0;
for (const recipe of recipes) {
  try {
    const meal_types = await classify(recipe);
    const patch = await fetch(`${rest}/recipes?id=eq.${recipe.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ meal_types }),
    });
    if (!patch.ok) throw new Error(`PATCH ${patch.status}: ${await patch.text()}`);
    ok++;
    console.log(`OK  ${recipe.title} -> [${meal_types.join(', ')}]`);
  } catch (e) {
    failed++;
    console.error(`XX  ${recipe.title} -> ${e.message}`);
  }
}
console.log(`Hecho. OK=${ok} FAILED=${failed}`);
