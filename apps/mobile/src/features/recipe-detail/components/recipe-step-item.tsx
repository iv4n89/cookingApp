import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { RecipeStep } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function stepDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  return mins >= 1 ? `${mins} min` : `${seconds}s`;
}

// A single numbered preparation step, with an optional timer hint.
export function RecipeStepItem({ step, index }: { step: RecipeStep; index: number }) {
  const number = String(index + 1).padStart(2, '0');
  const duration = stepDuration(step.timerSeconds);
  return (
    <View className="flex-row gap-gutter">
      <Text className="font-sans-semibold text-primary opacity-[0.15]" style={{ fontSize: 40, lineHeight: 40 }}>
        {number}
      </Text>
      <View className="flex-1">
        <Text className="font-sans text-body-md leading-relaxed text-on-surface-variant">{step.instruction}</Text>
        {duration ? (
          <View className="mt-stack-sm flex-row items-center gap-stack-sm">
            <MaterialIcons name="timer" size={16} color={colors.secondary} />
            <Text className="font-mono-medium text-label-sm text-secondary">{duration}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
