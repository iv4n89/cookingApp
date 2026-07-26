// Rellena recipes.image_prompt en las recetas creadas antes de esa columna, llamando a
// backfill-recipe-prompts por lotes hasta agotarlas. Solo texto: no genera imágenes.
//
// Después, para rehacer sus fotos con la descripción nueva:
//   FORCE=1 node scripts/backfill-recipe-images.mjs
//
// Uso (nube):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
//   INTERNAL_FUNCTION_SECRET=<secreto> [BATCH=20] node scripts/backfill-recipe-prompts.mjs

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const secret = process.env.INTERNAL_FUNCTION_SECRET;
const batch = Number(process.env.BATCH ?? '20');

if (!url || !anonKey || !secret) {
  console.error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY y/o INTERNAL_FUNCTION_SECRET.');
  process.exit(1);
}

async function describeBatch() {
  const res = await fetch(`${url}/functions/v1/backfill-recipe-prompts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ batch }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let total = 0;
for (let round = 1; ; round++) {
  const { processed, remaining } = await describeBatch();
  total += processed;
  console.log(`Lote ${round}: ${processed} descritas, ${remaining} pendientes.`);
  if (remaining === 0) break;
  if (processed === 0) {
    console.error('Ninguna descrita en este lote: corto para no repetir en vacío.');
    break;
  }
}

console.log(`\nTotal descritas: ${total}.`);
