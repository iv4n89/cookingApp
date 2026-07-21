import { fetchWithTimeout } from './http.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'recipe-images';
// Base pública (la que ve la app): la URL del proyecto. Debe estar configurada; sin ella no
// se persiste ninguna URL (mejor sin imagen que una URL rota guardada para siempre en la fila).
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
  const publicBase = Deno.env.get('PUBLIC_SUPABASE_URL');
  if (!publicBase) throw new Error('PUBLIC_SUPABASE_URL no configurada');

  const res = await fetchWithTimeout(pollinationsUrl(title), {}, IMAGE_TIMEOUT_MS);
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${recipeId}.jpg`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (upload.error) throw upload.error;

  const url = `${publicBase}/storage/v1/object/public/${BUCKET}/${path}`;
  const { error } = await supabase.from('recipes').update({ image_url: url }).eq('id', recipeId);
  if (error) throw error;
}
