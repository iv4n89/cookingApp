// Rellena las imágenes que faltan en el catálogo de ingredientes llamando a
// generate-ingredient-images por lotes hasta que no queda ninguna.
//
// La función es idempotente y devuelve cuántas quedan, así que el bucle simplemente reinvoca
// mientras siga bajando. Si un lote entero falla, corta para no girar en vacío.
//
// Uso (nube):
//   SUPABASE_URL=https://<ref>.supabase.co INTERNAL_FUNCTION_SECRET=<secreto> \
//   [BATCH=10] node scripts/backfill-ingredient-images.mjs

const url = process.env.SUPABASE_URL;
const secret = process.env.INTERNAL_FUNCTION_SECRET;
const batch = Number(process.env.BATCH ?? '10');

if (!url || !secret) {
  console.error('Faltan SUPABASE_URL y/o INTERNAL_FUNCTION_SECRET.');
  process.exit(1);
}

async function generateBatch() {
  const res = await fetch(`${url}/functions/v1/generate-ingredient-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ batch }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let total = 0;
for (let round = 1; ; round++) {
  const { processed, failed, remaining } = await generateBatch();
  total += processed;
  console.log(`Lote ${round}: ${processed} generadas, ${failed.length} fallidas, ${remaining} pendientes.`);
  if (failed.length > 0) console.log(`  fallidas: ${failed.join(', ')}`);
  if (remaining === 0) break;
  if (processed === 0) {
    console.error('Ningún ingrediente generado en este lote: corto para no repetir en vacío.');
    break;
  }
}

console.log(`\nTotal generadas: ${total}.`);
