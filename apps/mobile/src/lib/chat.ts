import { supabase } from './supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Envía el historial completo de la sesión; el backend le añade el contexto del usuario.
export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chat', { body: { messages } });
  if (error) throw error;
  return (data as { reply: string }).reply;
}
