import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { Benefit } from '@/features/premium/premium-content';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// A single premium benefit card: icon, title, description and a tag.
export function BenefitCard({ icon, title, text, tag }: Benefit) {
  return (
    <View className="gap-gutter rounded-xl border border-card-border bg-tertiary-fixed p-stack-lg">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
        <MaterialIcons name={icon} size={24} color={colors['on-primary']} />
      </View>
      <Text className="font-sans-semibold text-headline-sm text-primary">{title}</Text>
      <Text className="font-sans text-body-md text-on-surface-variant">{text}</Text>
      <View className="self-start rounded bg-primary-fixed px-stack-md py-stack-sm">
        <Text className="font-mono text-label-sm text-primary-container">{tag}</Text>
      </View>
    </View>
  );
}
