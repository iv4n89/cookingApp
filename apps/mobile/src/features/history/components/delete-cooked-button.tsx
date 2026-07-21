import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Delete (uncook) button shown in the cooked-recipe detail header.
export function DeleteCookedButton({ deleting, onPress }: { deleting: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deleting}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Borrar del historial"
      className="h-9 w-9 items-center justify-center rounded-full bg-on-surface">
      {deleting ? (
        <ActivityIndicator color={colors.background} />
      ) : (
        <MaterialIcons name="close" size={20} color={colors.background} />
      )}
    </Pressable>
  );
}
