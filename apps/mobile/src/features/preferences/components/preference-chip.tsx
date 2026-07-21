import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Toggleable pill for a single preference/need option.
export function PreferenceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-stack-sm rounded-full border px-stack-md py-stack-sm ${
        selected ? 'border-primary bg-primary' : 'border-outline-variant bg-surface'
      }`}>
      {selected ? <MaterialIcons name="check" size={15} color={colors['on-primary']} /> : null}
      <Text className={`font-sans text-body-md ${selected ? 'text-on-primary' : 'text-on-surface'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
