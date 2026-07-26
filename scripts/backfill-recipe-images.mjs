// Rellena las imágenes que faltan en el catálogo llamando a ensure-recipe-image por lotes.
// Re-ejecutable: salta las que ya están listas y, como un fallo de generación deja la receta en
// 'none', una segunda pasada reintenta las que no salieron.
//
// La función encola la generación en segundo plano y responde 'pending' al momento, así que el
// script espera THROTTLE_MS entre llamadas para no saturar fal, y al final consulta cuántas
// quedaron listas.
//
// Necesita la service_role key: la RLS de `recipes` solo deja leer a usuarios autenticados, y este
// script no tiene sesión de usuario.
//
// Uso (nube):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//   INTERNAL_FUNCTION_SECRET=<secreto> [THROTTLE_MS=2000] [LIMIT=0] [FORCE=1] \
//   node scripts/backfill-recipe-images.mjs
//
// Con FORCE=1 rehace también las que ya tienen imagen, para aprovechar una descripción mejor. La
// foto nueva sustituye a la vieja en el mismo objeto, así que ninguna receta se queda sin imagen.

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.INTERNAL_FUNCTION_SECRET;
const throttleMs = Number(process.env.THROTTLE_MS ?? '2000');
const limit = Number(process.env.LIMIT ?? '0'); // 0 = todas; >0 para probar
const force = process.env.FORCE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!secret) {
  console.error('Falta INTERNAL_FUNCTION_SECRET.');
  process.exit(1);
}

const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function pendingRecipes() {
  const params = new URLSearchParams({
    select: 'id,title',
    reusable: 'eq.true',
    order: 'title',
  });
  if (!force) params.set('image_url', 'is.null');
  const res = await fetch(`${url}/rest/v1/recipes?${params}`, { headers: restHeaders });
  if (!res.ok) throw new Error(`listar recetas: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function readyCount() {
  const params = new URLSearchParams({ select: 'id', reusable: 'eq.true', image_url: 'not.is.null' });
  const res = await fetch(`${url}/rest/v1/recipes?${params}`, {
    headers: { ...restHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range') ?? '';
  return Number(range.split('/')[1] ?? '0');
}

async function ensureImage(recipeId) {
  const res = await fetch(`${url}/functions/v1/ensure-recipe-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ recipeId, force }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

const before = await readyCount();
const all = await pendingRecipes();
const targets = limit > 0 ? all.slice(0, limit) : all;
console.log(
  force
    ? `Con imagen: ${before}. Rehaciendo todas: ${targets.length}.`
    : `Con imagen: ${before}. Sin imagen: ${all.length}. A procesar: ${targets.length}.`,
);

let queued = 0;
let failed = 0;
for (const [index, recipe] of targets.entries()) {
  try {
    await ensureImage(recipe.id);
    queued++;
    console.log(`  OK  [${index + 1}/${targets.length}] ${recipe.title}`);
  } catch (e) {
    failed++;
    console.error(`  XX  ${recipe.title} -> ${e.message}`);
  }
  await sleep(throttleMs);
}

// La generación va en segundo plano: deja margen antes de contar el resultado.
await sleep(15000);
const after = await readyCount();
console.log(`\nEncoladas: ${queued}, fallidas: ${failed}.`);
console.log(`Con imagen: ${before} -> ${after}. Reejecuta el script para reintentar las que falten.`);
