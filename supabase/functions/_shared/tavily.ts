import { fetchWithTimeout } from './http.ts';

const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 10000;

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

// Búsqueda web para dar contexto y atribución a la generación.
// Degrada con elegancia: sin clave o ante un fallo devuelve [] y el flujo
// sigue generando sin atribución.
export async function searchWeb(query: string): Promise<WebResult[]> {
  const key = Deno.env.get('TAVILY_API_KEY');
  if (!key) return [];

  try {
    const res = await fetchWithTimeout(
      TAVILY_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          query: `receta ${query}`,
          max_results: 3,
          search_depth: 'basic',
          topic: 'general',
        }),
      },
      TAVILY_TIMEOUT_MS,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results: WebResult[] = Array.isArray(data?.results) ? data.results : [];
    return results
      .filter((r) => r?.url && r?.title)
      .map((r) => ({ title: r.title, url: r.url, content: r.content ?? '' }));
  } catch (e) {
    console.error('searchWeb (Tavily) falló, se genera sin atribución:', e);
    return [];
  }
}
