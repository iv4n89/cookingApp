import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Centered status message for the recipe detail (load error / recipe not found), with an
// optional retry action.
export function RecipeDetailMessage({
  icon,
  text,
  onRetry,
}: {
  icon: 'error-outline' | 'search-off';
  text: string;
  onRetry?: () => void;
}) {
  return (
    <View className="mt-section-gap items-center gap-stack-md px-container-padding">
      <MaterialIcons name={icon} size={40} color={colors['outline-variant']} />
      <Text className="text-center font-sans text-body-md text-on-surface-variant">{text}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} className="rounded-lg border border-primary px-gutter py-stack-md">
          <Text className="font-mono-medium text-label-md text-primary">Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
