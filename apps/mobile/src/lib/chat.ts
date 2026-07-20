import { supabase } from './supabase';

export interface ChatRecipe {
  title: string;
  description?: string;
  servings?: number;
  prep_time_min?: number;
  cook_time_min?: number;
  ingredients: { name: string; quantity?: string; unit?: string }[];
  steps: { instruction: string; timer_seconds?: number }[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  recipe?: ChatRecipe | null;
}

export interface ChatReply {
  message: string;
  recipe?: ChatRecipe | null;
}

// Envía el historial completo de la sesión; el backend le añade el contexto del usuario.
export async function sendChat(messages: ChatMessage[]): Promise<ChatReply> {
  const { data, error } = await supabase.functions.invoke('chat', { body: { messages } });
  if (error) throw error;
  return data as ChatReply;
}
