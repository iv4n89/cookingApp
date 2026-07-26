import { downloadImage, falImageUrl } from './fal-image.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Global del edge runtime de Supabase para trabajo en segundo plano tras responder.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

const BUCKET = 'recipe-images';
const MAX_ATTEMPTS = 2;

function imagePrompt(title: string): string {
  return (
    `${title}, plato de comida terminado y bien emplatado, fotografía cenital apetecible, ` +
    `fondo neutro claro, luz natural suave, sin texto, sin marca de agua`
  );
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

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const bytes = await downloadImage(await falImageUrl(imagePrompt(title), 'landscape_4_3'));
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
