import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Companion to the cooking FAB: opens the AI modification modal for the recipe on screen.
export function RecipeAiBar({ onPress }: { onPress: () => void }) {
  return (
    <View className="absolute bottom-8 left-container-padding">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Pedir cambios a la IA"
        className="flex-row items-center gap-stack-md border border-primary bg-surface-container-lowest px-stack-lg py-gutter">
        <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
        <Text className="font-mono-medium text-label-md tracking-widest text-primary">PEDIR CAMBIOS</Text>
      </Pressable>
    </View>
  );
}
