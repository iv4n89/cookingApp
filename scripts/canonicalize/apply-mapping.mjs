// Aplica scripts/canonicalize/mapping.json a la base: agrupa por canonical_name, elige un
// canónico por grupo (prefiere categoría != 'Otros', luego nombre más corto) y setea
// ingredients.canonical_id (canónico -> null, resto -> id del canónico). Idempotente.
//
// Uso:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/canonicalize/apply-mapping.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const rest = `${url}/rest/v1`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function patch(ids, canonicalId) {
  const res = await fetch(`${rest}/ingredients?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ canonical_id: canonicalId }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
}

const mapping = JSON.parse(await readFile(join(here, 'mapping.json'), 'utf8'));
const groups = new Map();
for (const m of mapping) {
  if (!groups.has(m.canonical_name)) groups.set(m.canonical_name, []);
  groups.get(m.canonical_name).push(m);
}

let canonCount = 0;
let variantCount = 0;
for (const [, members] of groups) {
  // Canónico: preferir categoría != 'Otros', luego nombre más corto, luego id estable.
  const sorted = [...members].sort(
    (a, b) =>
      (a.category === 'Otros') - (b.category === 'Otros') ||
      a.name.length - b.name.length ||
      a.id.localeCompare(b.id),
  );
  const canonical = sorted[0];
  await patch([canonical.id], null);
  canonCount++;
  const variants = sorted.slice(1).map((m) => m.id);
  if (variants.length) {
    await patch(variants, canonical.id);
    variantCount += variants.length;
  }
}
console.log(`Aplicado: ${groups.size} grupos, ${canonCount} canónicos, ${variantCount} variantes.`);
