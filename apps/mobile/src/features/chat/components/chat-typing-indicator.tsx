import { ActivityIndicator, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Placeholder assistant bubble shown while waiting for a reply.
export function ChatTypingIndicator() {
  return (
    <View className="items-start gap-stack-sm">
      <Text className="font-mono uppercase text-label-sm text-on-surface-variant">Asistente</Text>
      <View className="rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low px-stack-lg py-gutter">
        <ActivityIndicator color={colors.primary} />
      </View>
    </View>
  );
}
