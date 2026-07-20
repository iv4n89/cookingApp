const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = 'gemini-embedding-001';

export const EMBED_DIM = 768;

export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

function apiKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  return key;
}

// gemini-embedding-001 requiere normalizar a mano si output_dimensionality != 3072.
function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, x) => sum + x * x, 0));
  return norm > 0 ? values.map((x) => x / norm) : values;
}

export async function embedText(text: string, taskType: EmbedTask): Promise<number[]> {
  const res = await fetch(`${BASE}/models/${EMBED_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify({
      taskType,
      content: { parts: [{ text }] },
      output_dimensionality: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error('Respuesta de embedding inesperada de Gemini');
  }
  return normalize(values);
}
