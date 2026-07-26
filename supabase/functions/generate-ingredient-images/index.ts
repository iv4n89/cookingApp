import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { downloadImage, falImageUrl } from '../_shared/fal-image.ts';

// Endpoint interno: genera con IA la imagen de los ingredientes que aún no tienen y la sube al
// bucket. Idempotente: solo rellena los que faltan, por lotes, para poder llamarlo repetidamente
// hasta agotar el catálogo.
const BUCKET = 'ingredient-images';
// Flux schnell tarda ~2s por imagen, así que un lote de 10 entra de sobra en los 150s de la
// función. Cada imagen se persiste al momento: basta reinvocar hasta que no quede ninguna.
const DEFAULT_BATCH = 10;

function imagePrompt(name: string): string {
  return (
    `${name}, single fresh ingredient, clean product photography, plain light neutral background, ` +
    `soft studio lighting, centered, no text, no watermark, photorealistic`
  );
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
      const bytes = await downloadImage(await falImageUrl(imagePrompt(ingredient.name), 'square'));
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
