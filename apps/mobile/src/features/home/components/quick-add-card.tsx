import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Dashed card that jumps to the pantry to add an ingredient.
export function QuickAddCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Añadir a la despensa"
      className="flex-row items-center justify-center gap-stack-md rounded-xl border-2 border-dashed border-card-border bg-card p-stack-lg">
      <MaterialIcons name="add-circle-outline" size={24} color={colors.primary} />
      <Text className="font-mono-medium text-label-md text-primary">AÑADIR A LA DESPENSA</Text>
    </Pressable>
  );
}
