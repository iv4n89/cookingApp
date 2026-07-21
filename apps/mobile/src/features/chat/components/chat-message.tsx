import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { ChatMessage } from '@/lib/chat';
import type { PantryMatch } from '@/lib/pantry';

import { ChatRecipeCard } from './chat-recipe-card';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// A single chat message: role label, text bubble, optional suggestion chips and, for assistant
// replies, the recipe card.
export function ChatMessageView({
  message,
  pantry,
  onPickSuggestion,
}: {
  message: ChatMessage;
  pantry: PantryMatch | null;
  onPickSuggestion: (title: string) => void;
}) {
  const mine = message.role === 'user';
  return (
    <View className={mine ? 'items-end gap-stack-sm' : 'items-start gap-stack-md'}>
      <Text className="font-mono uppercase text-label-sm text-on-surface-variant">
        {mine ? 'Tú' : 'Asistente'}
      </Text>
      {message.content ? (
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
      ) : null}
      {message.suggestions && message.suggestions.length > 0 ? (
        <View className="w-full max-w-[88%] gap-stack-sm">
          {message.suggestions.map((s, i) => (
            <Pressable
              key={i}
              onPress={() => onPickSuggestion(s.title)}
              className="flex-row items-center justify-between gap-stack-md rounded-xl border border-outline-variant bg-surface-container-low px-stack-lg py-gutter">
              <View className="flex-1">
                <Text className="font-sans-semibold text-body-md text-on-surface">{s.title}</Text>
                {s.hint ? (
                  <Text className="font-mono text-label-sm text-on-surface-variant">{s.hint}</Text>
                ) : null}
              </View>
              <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {message.recipe ? <ChatRecipeCard recipe={message.recipe} pantry={pantry} /> : null}
    </View>
  );
}
