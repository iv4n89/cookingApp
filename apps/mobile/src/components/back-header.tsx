import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Simple screen header: a back button, a title and an optional right-aligned slot.
export function BackHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-gutter border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text className="flex-1 font-sans-bold text-headline-sm text-primary">{title}</Text>
      {right ?? null}
    </View>
  );
}
