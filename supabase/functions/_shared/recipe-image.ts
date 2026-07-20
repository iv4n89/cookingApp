import { fetchWithTimeout } from './http.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'recipe-images';
// Base pública (la que ve la app). En local es 127.0.0.1:54321; en la nube, la URL del proyecto.
const PUBLIC_BASE = Deno.env.get('PUBLIC_SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const IMAGE_TIMEOUT_MS = 60000;

function pollinationsUrl(title: string): string {
  const prompt =
    `${title}, plato de comida terminado y bien emplatado, fotografía cenital apetecible, ` +
    `fondo neutro claro, luz natural suave, sin texto, sin marca de agua`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&nologo=true&model=flux`;
}

// Genera la imagen de la receta (Pollinations), la sube al bucket y guarda su URL pública.
// Pensada para ejecutarse en segundo plano (no bloquea la respuesta).
export async function generateRecipeImage(
  supabase: SupabaseClient,
  recipeId: string,
  title: string,
): Promise<void> {
  const res = await fetchWithTimeout(pollinationsUrl(title), {}, IMAGE_TIMEOUT_MS);
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${recipeId}.jpg`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (upload.error) throw upload.error;

  const url = `${PUBLIC_BASE}/storage/v1/object/public/${BUCKET}/${path}`;
  const { error } = await supabase.from('recipes').update({ image_url: url }).eq('id', recipeId);
  if (error) throw error;
}
