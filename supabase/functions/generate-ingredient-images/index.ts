import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { downloadImage, falImageUrl } from '../_shared/fal-image.ts';
import { describeIngredientsVisually } from '../_shared/gemini.ts';

// Endpoint interno: genera con IA la imagen de los ingredientes que aún no tienen y la sube al
// bucket. Idempotente: solo rellena los que faltan, por lotes, para poder llamarlo repetidamente
// hasta agotar el catálogo.
const BUCKET = 'ingredient-images';
// Flux schnell tarda ~2s por imagen, así que un lote de 10 entra de sobra en los 150s de la
// función. Cada imagen se persiste al momento: basta reinvocar hasta que no quede ninguna.
const DEFAULT_BATCH = 10;

// El sujeto llega ya descrito en inglés; aquí solo se fija el encuadre y lo que no debe aparecer.
// Nada de condicionales ("los líquidos, en un vaso"): el modelo los aplica a todo y acaba metiendo
// tarros y polvo en ingredientes que no los llevan.
function imagePrompt(visual: string): string {
  return (
    `${visual}. Supermarket online catalogue photo of this single food ingredient as it is sold, ` +
    `the ingredient itself and not a prepared dish. Centered, filling most of the frame, ` +
    `pure white background, bright even flat lighting, no harsh shadows, sharp focus, ` +
    `true-to-life colours, slightly appetising but plain and honest, like a grocery shop listing. ` +
    `No text, no labels, no logos, no branded packaging, no hands, no people, no collage, ` +
    `no split frame`
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
    .select('id, name, category')
    .is('image_url', null)
    .order('name')
    .limit(batch);
  if (error) return json({ error: 'No se pudieron leer los ingredientes.' }, 500);

  // Una sola llamada para todo el lote. Si falla, el nombre en español sirve de reserva.
  const visuals = await describeIngredientsVisually(pending ?? []).catch((e) => {
    console.error('generate-ingredient-images: descripción visual', e);
    return new Map<string, string>();
  });

  let processed = 0;
  const failed: string[] = [];
  for (const ingredient of pending ?? []) {
    try {
      const visual = visuals.get(ingredient.name) ?? `${ingredient.name} (${ingredient.category})`;
      const bytes = await downloadImage(await falImageUrl(imagePrompt(visual), 'square'));
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
