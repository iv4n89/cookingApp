import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Section title with an optional right-aligned action link.
export function HomeSectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mb-stack-lg flex-row items-center justify-between">
      <Text className="font-sans-semibold text-headline-md text-on-surface">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} className="flex-row items-center gap-stack-sm">
          <Text className="font-mono-medium text-label-md text-primary">{action}</Text>
          <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}
