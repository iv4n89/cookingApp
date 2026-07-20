import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { sendChat, type ChatMessage } from '@/lib/chat';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const SUGGESTIONS = [
  'Tengo mantequilla y patatas, dame una receta',
  '¿Qué puedo cocinar con lo que tengo?',
  'Algo rápido para cenar hoy',
];

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <View className={mine ? 'items-end gap-stack-sm' : 'items-start gap-stack-sm'}>
      <Text className="font-mono uppercase text-label-sm text-on-surface-variant">
        {mine ? 'Tú' : 'Asistente'}
      </Text>
      <View
        className={`max-w-[88%] px-stack-lg py-gutter ${
          mine
            ? 'rounded-xl rounded-tr-none border border-primary bg-primary'
            : 'rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low'
        }`}>
        <Text className={`font-sans text-body-lg ${mine ? 'text-on-primary' : 'text-on-surface'}`}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View className="mt-section-gap items-center gap-stack-lg px-container-padding">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-tertiary-fixed">
        <MaterialIcons name="auto-awesome" size={26} color={colors.primary} />
      </View>
      <Text className="text-center font-sans-semibold text-headline-sm text-on-surface">
        Pregúntame qué cocinar
      </Text>
      <Text className="text-center font-sans text-body-md text-on-surface-variant">
        Tengo en cuenta tus preferencias, tus necesidades y lo que hay en tu despensa.
      </Text>
      <View className="gap-stack-md">
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPick(s)}
            className="rounded-full border border-outline-variant bg-surface px-stack-lg py-stack-md">
            <Text className="font-sans text-body-md text-on-surface">{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    setFailed(false);
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setSending(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    try {
      const reply = await sendChat(next);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-stack-lg gap-stack-lg"
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <EmptyState onPick={send} />
          ) : (
            messages.map((m, i) => <Bubble key={i} message={m} />)
          )}
          {sending ? (
            <View className="items-start gap-stack-sm">
              <Text className="font-mono uppercase text-label-sm text-on-surface-variant">Asistente</Text>
              <View className="rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low px-stack-lg py-gutter">
                <ActivityIndicator color={colors.primary} />
              </View>
            </View>
          ) : null}
          {failed ? (
            <Text className="font-sans text-body-md text-error">
              No se pudo responder. Inténtalo de nuevo.
            </Text>
          ) : null}
        </ScrollView>

        <View className="flex-row items-center gap-stack-sm border-t border-outline-variant bg-background px-container-padding py-stack-md">
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            editable={!sending}
            placeholder="Pregunta sobre recetas o ingredientes…"
            placeholderTextColor={colors['on-surface-variant']}
            className="flex-1 rounded-full border border-outline-variant bg-surface-container-lowest px-gutter py-stack-md font-sans text-body-md text-on-surface"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${
              sending || !input.trim() ? 'opacity-50' : ''
            }`}>
            <MaterialIcons name="send" size={20} color={colors['on-primary']} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
