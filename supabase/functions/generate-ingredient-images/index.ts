import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { fetchWithTimeout } from '../_shared/http.ts';

// Endpoint interno: genera con IA (Pollinations) la imagen de los ingredientes
// que aún no tienen y la sube al bucket. Idempotente: solo rellena los que faltan,
// por lotes, para poder llamarlo repetidamente hasta agotar el catálogo.
const BUCKET = 'ingredient-images';
// Pollinations tarda ~30-40s por imagen; con el límite de 150s de la función,
// un lote pequeño evita que se corte a media ejecución. Es idempotente:
// cada imagen se persiste al momento, así que basta con reinvocar hasta agotar.
const DEFAULT_BATCH = 3;
const IMAGE_TIMEOUT_MS = 90000;

function imagePrompt(name: string): string {
  return (
    `${name}, single fresh ingredient, clean product photography, plain light neutral background, ` +
    `soft studio lighting, centered, no text, no watermark, photorealistic`
  );
}

function pollinationsUrl(prompt: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!hasInternalSecret(req)) return json({ error: 'No autorizado.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { batch?: number };
  const batch = Number.isInteger(body.batch) && body.batch! > 0 ? body.batch! : DEFAULT_BATCH;

  const supabase = serviceClient();
  const { data: pending, error } = await supabase
    .from('ingredients')
    .select('id, name')
    .is('image_url', null)
    .order('name')
    .limit(batch);
  if (error) return json({ error: 'No se pudieron leer los ingredientes.' }, 500);

  let processed = 0;
  const failed: string[] = [];
  for (const ingredient of pending ?? []) {
    try {
      const res = await fetchWithTimeout(pollinationsUrl(imagePrompt(ingredient.name)), {}, IMAGE_TIMEOUT_MS);
      if (!res.ok) throw new Error(`pollinations ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const path = `${ingredient.id}.jpg`;
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (upload.error) throw upload.error;
      const { error: updateError } = await supabase
        .from('ingredients')
        .update({ image_url: path })
        .eq('id', ingredient.id);
      if (updateError) throw updateError;
      processed++;
    } catch (e) {
      console.error('generate-ingredient-images:', ingredient.name, e);
      failed.push(ingredient.name);
    }
  }

  const { count: remaining } = await supabase
    .from('ingredients')
    .select('*', { count: 'exact', head: true })
    .is('image_url', null);

  return json({ processed, failed, remaining: remaining ?? 0 });
});
