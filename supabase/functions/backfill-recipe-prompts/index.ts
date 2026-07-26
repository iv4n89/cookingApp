import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { describeDishesVisually } from '../_shared/gemini.ts';

// Endpoint interno: rellena recipes.image_prompt en las recetas creadas antes de esa columna, cuya
// foto se generó solo con el título. Por lotes e idempotente: basta reinvocar hasta agotarlas.
const DEFAULT_BATCH = 20;
const PROMPT_INGREDIENTS = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!hasInternalSecret(req)) return json({ error: 'No autorizado.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { batch?: number };
  const batch = Number.isInteger(body.batch) && body.batch! > 0 ? body.batch! : DEFAULT_BATCH;

  const supabase = serviceClient();
  const { data: pending, error } = await supabase
    .from('recipes')
    .select('id, title, ingredients')
    .eq('reusable', true)
    .is('image_prompt', null)
    .order('title')
    .limit(batch);
  if (error) return json({ error: 'No se pudieron leer las recetas.' }, 500);

  const items = pending ?? [];
  if (!items.length) return json({ processed: 0, remaining: 0 });

  const dishes = items.map((recipe) => ({
    title: recipe.title as string,
    ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map((item) => String((item as { name?: unknown })?.name ?? '').trim())
      .filter(Boolean)
      .slice(0, PROMPT_INGREDIENTS),
  }));

  let visuals: (string | undefined)[];
  try {
    visuals = await describeDishesVisually(dishes);
  } catch (e) {
    console.error('backfill-recipe-prompts:', e);
    return json({ error: 'No se pudieron describir los platos.' }, 502);
  }

  let processed = 0;
  for (const [index, recipe] of items.entries()) {
    const visual = visuals[index]?.trim();
    if (!visual) continue;
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ image_prompt: visual })
      .eq('id', recipe.id);
    if (updateError) {
      console.error('backfill-recipe-prompts:', recipe.title, updateError);
      continue;
    }
    processed++;
  }

  const { count: remaining } = await supabase
    .from('recipes')
    .select('*', { count: 'exact', head: true })
    .eq('reusable', true)
    .is('image_prompt', null);

  return json({ processed, remaining: remaining ?? 0 });
});
