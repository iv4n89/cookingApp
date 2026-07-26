import { fetchWithTimeout } from './http.ts';

// Generación de imágenes con fal.ai Flux schnell, compartida por recetas e ingredientes.
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';
const FAL_TIMEOUT_MS = 30000;

export type FalImageSize = 'square' | 'landscape_4_3';

// Genera la imagen y devuelve la URL temporal del resultado en fal.
export async function falImageUrl(prompt: string, imageSize: FalImageSize): Promise<string> {
  const key = Deno.env.get('FAL_KEY');
  if (!key) throw new Error('FAL_KEY no configurada');
  const res = await fetchWithTimeout(
    FAL_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
      body: JSON.stringify({
        prompt,
        image_size: imageSize,
        num_inference_steps: 4,
        num_images: 1,
      }),
    },
    FAL_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (typeof url !== 'string') throw new Error('Respuesta de fal inesperada');
  return url;
}

export async function downloadImage(url: string): Promise<Uint8Array> {
  const res = await fetchWithTimeout(url, {}, FAL_TIMEOUT_MS);
  if (!res.ok) throw new Error(`descarga imagen ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
