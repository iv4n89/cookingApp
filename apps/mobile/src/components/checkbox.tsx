import { MaterialIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      className={`h-5 w-5 items-center justify-center rounded-sm border-2 ${
        checked ? 'border-primary bg-primary' : 'border-outline'
      }`}>
      {checked ? <MaterialIcons name="check" size={14} color={colors['on-primary']} /> : null}
    </Pressable>
  );
}
