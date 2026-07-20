import { getUserId, isAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { generateChat, type ChatTurn } from '../_shared/gemini.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Acota coste y contexto: solo los últimos mensajes y un tope por mensaje.
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 2000;

interface InMessage {
  role: 'user' | 'assistant';
  content: string;
}

const BASE_PROMPT =
  'Eres el asistente de cocina de RecetasApp. Ayudas al usuario a decidir qué cocinar y a ' +
  'adaptar recetas de forma práctica y cercana. Responde en español, en texto plano (sin markdown), ' +
  'con mensajes claros y no demasiado largos. Cuando propongas una receta, da ingredientes y pasos ' +
  'concisos. Aprovecha el contexto de la conversación. No des consejo médico ni nutricional profesional.';

// Contexto siempre activo del usuario: necesidades (a respetar), preferencias y despensa.
async function buildSystemInstruction(supabase: SupabaseClient, userId: string | null): Promise<string> {
  if (!userId) return BASE_PROMPT;

  const [prefsRes, pantryRes] = await Promise.all([
    supabase.from('user_preferences').select('food_prefs, special_needs, notes').eq('user_id', userId).maybeSingle(),
    supabase.from('pantry_items').select('name').eq('user_id', userId).limit(100),
  ]);
  const prefs = prefsRes.data;
  const pantry = pantryRes.data;

  const parts = [BASE_PROMPT];
  if (prefs?.special_needs?.length) {
    parts.push(
      `Necesidades del usuario que debes respetar SIEMPRE, evitando esos ingredientes y sus derivados: ${prefs.special_needs.join(', ')}.`,
    );
  }
  if (prefs?.food_prefs?.length) {
    parts.push(`Preferencias del usuario: ${prefs.food_prefs.join(', ')}.`);
  }
  const notes = (prefs?.notes ?? '').trim().slice(0, 500);
  if (notes) parts.push(`Notas del usuario: ${notes}`);
  if (pantry?.length) {
    parts.push(
      `Ingredientes que el usuario tiene en su despensa: ${pantry.map((p) => p.name).join(', ')}. ` +
        `Prioriza recetas que aprovechen lo que ya tiene.`,
    );
  }
  return parts.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isAuthenticatedUser(req)) return json({ error: 'No autorizado.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { messages?: InMessage[] };
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages?.length) return json({ error: 'Faltan mensajes.' }, 400);

  const turns: ChatTurn[] = messages
    .slice(-MAX_MESSAGES)
    .filter(
      (m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'),
    )
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      text: m.content.slice(0, MAX_CONTENT_LENGTH),
    }));
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    return json({ error: 'El último mensaje debe ser del usuario.' }, 400);
  }

  try {
    const supabase = serviceClient();
    const system = await buildSystemInstruction(supabase, getUserId(req));
    const reply = await generateChat(turns, system);
    return json({ reply });
  } catch (e) {
    console.error('chat:', e);
    return json({ error: 'No se pudo responder.' }, 500);
  }
});
