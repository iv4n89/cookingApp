import { downloadImage, falImageUrl } from './fal-image.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Global del edge runtime de Supabase para trabajo en segundo plano tras responder.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

const BUCKET = 'recipe-images';
const MAX_ATTEMPTS = 2;

// Los ingredientes van en el prompt porque con el título a secas el modelo se inventa el plato:
// "Ensalada rápida de palitos de cangrejo" salía con pasta, tomate y lechuga, sin maíz ni mayonesa.
const PROMPT_INGREDIENTS = 8;

function imagePrompt(subject: string): string {
  return (
    `${subject}. Finished plated dish, appetising overhead food photography, plain light background, ` +
    `soft natural light, no text, no watermark`
  );
}

// El sujeto de la foto. Se prefiere la descripción en inglés que dejó el LLM al crear la receta;
// las recetas anteriores a esa columna caen al título más sus ingredientes, en español.
async function imageSubject(supabase: SupabaseClient, recipeId: string, title: string): Promise<string> {
  const { data } = await supabase
    .from('recipes')
    .select('image_prompt, ingredients')
    .eq('id', recipeId)
    .maybeSingle();
  const described = typeof data?.image_prompt === 'string' ? data.image_prompt.trim() : '';
  if (described) return described;

  const items = Array.isArray(data?.ingredients) ? data.ingredients : [];
  const names = items
    .map((item) => String((item as { name?: unknown })?.name ?? '').trim())
    .filter(Boolean)
    .slice(0, PROMPT_INGREDIENTS);
  return names.length
    ? `${title}. Lleva exactamente estos ingredientes y ningún otro: ${names.join(', ')}`
    : title;
}

// Genera la imagen de una receta reutilizable, la sube al bucket y fija image_status.
// Pensada para segundo plano. Garantiza terminar en 'ready' o 'none' (nunca deja 'pending').
export async function generateRecipeImage(
  supabase: SupabaseClient,
  recipeId: string,
  title: string,
): Promise<void> {
  const publicBase = Deno.env.get('PUBLIC_SUPABASE_URL');
  if (!publicBase) {
    await supabase.from('recipes').update({ image_status: 'none' }).eq('id', recipeId);
    return;
  }

  const subject = await imageSubject(supabase, recipeId, title);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const bytes = await downloadImage(await falImageUrl(imagePrompt(subject), 'landscape_4_3'));
      const path = `${recipeId}.jpg`;
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (upload.error) throw upload.error;
      const url = `${publicBase}/storage/v1/object/public/${BUCKET}/${path}`;
      const { error } = await supabase
        .from('recipes')
        .update({ image_url: url, image_status: 'ready' })
        .eq('id', recipeId);
      if (error) throw error;
      return;
    } catch (e) {
      lastError = e;
    }
  }
  // Tras los reintentos, sin imagen: placeholder.
  await supabase.from('recipes').update({ image_status: 'none' }).eq('id', recipeId);
  console.error('recipe image:', lastError);
}

// Encola la generación en segundo plano. Solo debe llamarse para recetas reutilizables.
export function queueRecipeImage(supabase: SupabaseClient, id: unknown, title: unknown): void {
  if (typeof id !== 'string' || typeof title !== 'string') return;
  const task = generateRecipeImage(supabase, id, title).catch((e) => console.error('recipe image:', e));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
}
