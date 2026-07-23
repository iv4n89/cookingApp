import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

const MAX_SERVINGS = 20;

// Stepper to pick the number of servings. Shared by the recipe detail and the chat recipe card.
export function ServingsStepper({
  servings,
  onChange,
}: {
  servings: number;
  onChange: (next: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
      <Text className="font-sans-semibold text-body-md text-on-surface">Raciones</Text>
      <View className="flex-row items-center gap-gutter">
        <Pressable
          onPress={() => onChange(Math.max(1, servings - 1))}
          disabled={servings <= 1}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Menos raciones"
          className={servings <= 1 ? 'opacity-40' : ''}>
          <MaterialIcons name="remove-circle-outline" size={28} color={colors.primary} />
        </Pressable>
        <Text className="w-8 text-center font-mono-medium text-headline-sm text-on-surface">{servings}</Text>
        <Pressable
          onPress={() => onChange(Math.min(MAX_SERVINGS, servings + 1))}
          disabled={servings >= MAX_SERVINGS}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Más raciones"
          className={servings >= MAX_SERVINGS ? 'opacity-40' : ''}>
          <MaterialIcons name="add-circle-outline" size={28} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}
