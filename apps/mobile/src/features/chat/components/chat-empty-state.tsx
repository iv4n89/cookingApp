import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const SUGGESTIONS = [
  'Tengo mantequilla y patatas, dame una receta',
  '¿Qué puedo cocinar con lo que tengo?',
  'Algo rápido para cenar hoy',
];

// Shown when the conversation is empty: a prompt and a few tappable example questions.
export function ChatEmptyState({ onPick }: { onPick: (text: string) => void }) {
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
