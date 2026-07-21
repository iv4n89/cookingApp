import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Entry point to the AI chat: a faux input that opens the ask modal.
export function HomeAskInput({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Pregunta a la IA"
      className="flex-row items-center gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest px-gutter py-gutter">
      <MaterialIcons name="chat-bubble-outline" size={22} color={colors.primary} />
      <Text className="flex-1 font-sans text-body-lg text-on-surface-variant">Pregunta a la IA…</Text>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
        <MaterialIcons name="arrow-forward" size={20} color={colors['on-primary']} />
      </View>
    </Pressable>
  );
}
