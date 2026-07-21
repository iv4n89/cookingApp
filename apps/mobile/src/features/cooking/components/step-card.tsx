import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { RecipeStep } from '@/lib/recipes';

import { StepTimer } from './step-timer';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export type StepStatus = 'done' | 'active' | 'upcoming';

function NumberBadge({ status, n }: { status: StepStatus; n: number }) {
  const style =
    status === 'upcoming' ? 'bg-surface-container-highest border border-outline-variant' : 'bg-primary';
  return (
    <View className={`absolute -left-4 top-6 z-10 h-10 w-10 items-center justify-center rounded-full ${style}`}>
      {status === 'done' ? (
        <MaterialIcons name="check" size={20} color={colors['on-primary']} />
      ) : (
        <Text
          className={`font-sans-semibold text-headline-sm ${
            status === 'active' ? 'text-on-primary' : 'text-on-surface-variant'
          }`}>
          {n}
        </Text>
      )}
    </View>
  );
}

// A cooking step card: number badge, current-step highlight, instruction, optional timer and a
// "done" checkbox.
export function StepCard({
  step,
  index,
  status,
  onToggleDone,
}: {
  step: RecipeStep;
  index: number;
  status: StepStatus;
  onToggleDone: () => void;
}) {
  const isDone = status === 'done';
  const number = String(index + 1).padStart(2, '0');
  return (
    <View
      className={`relative rounded-xl p-gutter ${
        status === 'active'
          ? 'border-2 border-primary bg-surface-container-lowest'
          : 'border border-outline-variant bg-surface-container-low'
      } ${isDone ? 'opacity-60' : ''}`}>
      <NumberBadge status={status} n={index + 1} />
      <View className="ml-stack-lg gap-stack-md">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-headline-md text-primary opacity-20">{number}</Text>
          {status === 'active' ? (
            <View className="rounded bg-secondary-container px-stack-md py-stack-sm">
              <Text className="font-mono text-label-sm text-secondary">PASO ACTUAL</Text>
            </View>
          ) : null}
        </View>

        <Text
          className={`font-sans leading-relaxed ${
            status === 'active' ? 'text-body-lg text-on-surface' : 'text-body-md text-on-surface-variant'
          } ${isDone ? 'line-through' : ''}`}>
          {step.instruction}
        </Text>

        {step.timerSeconds && step.timerSeconds > 0 ? <StepTimer seconds={step.timerSeconds} /> : null}

        <Pressable onPress={onToggleDone} className="flex-row items-center gap-stack-sm self-start">
          <MaterialIcons
            name={isDone ? 'check-box' : 'check-box-outline-blank'}
            size={20}
            color={isDone ? colors.primary : colors['on-surface-variant']}
          />
          <Text className="font-mono-medium text-label-md text-on-surface-variant">
            {isDone ? 'Hecho' : 'Marcar como hecho'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
