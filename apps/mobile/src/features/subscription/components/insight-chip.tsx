import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

// Small labeled chip highlighting a subscription perk.
export function InsightChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View className="flex-row items-center gap-stack-sm border border-outline-variant bg-tertiary-fixed px-stack-md py-stack-sm">
      <MaterialIcons name={icon} size={16} color={colors['on-tertiary-fixed-variant']} />
      <Text className="font-mono text-label-sm text-on-tertiary-fixed-variant">{label}</Text>
    </View>
  );
}
