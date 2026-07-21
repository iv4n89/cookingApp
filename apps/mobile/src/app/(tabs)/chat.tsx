import { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { ChatEmptyState } from '@/features/chat/components/chat-empty-state';
import { ChatInputBar } from '@/features/chat/components/chat-input-bar';
import { ChatMessageView } from '@/features/chat/components/chat-message';
import { ChatTypingIndicator } from '@/features/chat/components/chat-typing-indicator';
import { useChat } from '@/features/chat/hooks/use-chat';

export default function ChatScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const { messages, input, setInput, sending, failed, pantry, send } = useChat();

  // Keep the latest message in view as the conversation grows or a reply lands.
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, sending]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-stack-lg gap-stack-lg"
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <ChatEmptyState onPick={send} />
          ) : (
            messages.map((m, i) => (
              <ChatMessageView
                key={i}
                message={m}
                pantry={pantry}
                onPickSuggestion={(title) => send(`Quiero la receta de "${title}"`)}
              />
            ))
          )}
          {sending ? <ChatTypingIndicator /> : null}
          {failed ? (
            <Text className="font-sans text-body-md text-error">No se pudo responder. Inténtalo de nuevo.</Text>
          ) : null}
        </ScrollView>

        <KeyboardStickyView>
          <ChatInputBar value={input} onChangeText={setInput} sending={sending} onSend={() => send(input)} />
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
}
