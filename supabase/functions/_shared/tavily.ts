const TAVILY_URL = 'https://api.tavily.com/search';

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
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: `receta ${query}`,
        max_results: 3,
        search_depth: 'basic',
        topic: 'general',
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: WebResult[] = Array.isArray(data?.results) ? data.results : [];
    return results
      .filter((r) => r?.url && r?.title)
      .map((r) => ({ title: r.title, url: r.url, content: r.content ?? '' }));
  } catch {
    return [];
  }
}
