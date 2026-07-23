import { MaterialIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Floating action button to add a new pantry item.
export function PantryAddButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary">
      <MaterialIcons name="add" size={28} color={colors['on-primary']} />
    </Pressable>
  );
}
