import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Recipe detail header: back button, brand title and an optional favorite toggle.
export function RecipeTopBar({
  favorite,
  onToggleFavorite,
}: {
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-gutter border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text className="flex-1 font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
      {onToggleFavorite ? (
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
          <MaterialIcons
            name={favorite ? 'favorite' : 'favorite-border'}
            size={24}
            color={favorite ? colors.primary : colors['on-surface-variant']}
          />
        </Pressable>
      ) : null}
    </View>
  );
}
