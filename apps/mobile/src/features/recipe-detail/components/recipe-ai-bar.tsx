import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Inline outlined button (companion to the filled "add missing" one): opens the AI
// modification modal for the recipe on screen.
export function RecipeAiBar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Pedir cambios a la IA"
      className="flex-row items-center justify-center gap-stack-md border border-primary py-gutter">
      <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
      <Text className="font-mono-medium text-label-md tracking-widest text-primary">
        PEDIR CAMBIOS A LA IA
      </Text>
    </Pressable>
  );
}
