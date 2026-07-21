import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { sendChat, type ChatMessage } from '@/lib/chat';
import { getPantryMatch, type PantryMatch } from '@/lib/pantry';

// Owns the chat conversation state and talking to the assistant. Also seeds a new conversation
// from a question handed over by the Home screen. Auto-scroll is left to the screen.
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pantry, setPantry] = useState<PantryMatch | null>(null);
  const params = useLocalSearchParams<{ q?: string; t?: string }>();

  useEffect(() => {
    let active = true;
    getPantryMatch()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Sends a conversation (history already including the user's last message) and appends the
  // reply. When seeded from Home the history is a single message (a fresh conversation).
  async function runChat(history: ChatMessage[]) {
    setFailed(false);
    setMessages(history);
    setSending(true);
    try {
      const reply = await sendChat(history);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply.message, recipe: reply.recipe, suggestions: reply.suggestions },
      ]);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    runChat([...messages, { role: 'user', content }]);
  }

  // Question arriving from Home: a new conversation with that text as the first message. It is
  // keyed by the nonce t (one tap) so asking the same question again restarts the conversation.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    const q = typeof params.q === 'string' ? params.q.trim() : '';
    const t = typeof params.t === 'string' ? params.t : '';
    if (q && t && seeded.current !== t) {
      seeded.current = t;
      runChat([{ role: 'user', content: q }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.t]);

  return { messages, input, setInput, sending, failed, pantry, send };
}
