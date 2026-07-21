import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { RecipeStep } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// A read-only numbered step with an optional duration, for the cooked-recipe detail.
export function CookedStepItem({ step, index }: { step: RecipeStep; index: number }) {
  const number = String(index + 1).padStart(2, '0');
  const minutes = step.timerSeconds ? Math.round(step.timerSeconds / 60) : 0;
  return (
    <View className="flex-row gap-gutter">
      <Text className="font-sans-semibold text-primary opacity-[0.15]" style={{ fontSize: 40, lineHeight: 40 }}>
        {number}
      </Text>
      <View className="flex-1">
        <Text className="font-sans text-body-md leading-relaxed text-on-surface-variant">{step.instruction}</Text>
        {minutes > 0 ? (
          <View className="mt-stack-sm flex-row items-center gap-stack-sm">
            <MaterialIcons name="timer" size={16} color={colors.secondary} />
            <Text className="font-mono-medium text-label-sm text-secondary">{minutes} MIN</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
