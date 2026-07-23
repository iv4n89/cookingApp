import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { SettingItem } from '@/features/profile/profile-content';

import { colors } from '@recetas/theme/tokens';

// A tappable account settings row with an icon, title and subtitle.
export function SettingsRow({ icon, title, subtitle, onPress }: SettingItem) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
      <View className="flex-1 flex-row items-center gap-stack-md">
        <View className="h-10 w-10 items-center justify-center rounded bg-tertiary-fixed">
          <MaterialIcons name={icon} size={22} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold text-headline-sm text-on-surface">{title}</Text>
          <Text className="font-mono text-label-sm text-on-surface-variant">{subtitle}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
    </Pressable>
  );
}
