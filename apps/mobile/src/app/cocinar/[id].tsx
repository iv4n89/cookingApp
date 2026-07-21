import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRecipe, type Recipe, type RecipeStep } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type StepStatus = 'done' | 'active' | 'upcoming';

function formatTime(totalSeconds: number) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function TopBar() {
  return (
    <View className="flex-row items-center gap-gutter border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text className="font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
    </View>
  );
}

function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const done = remaining === 0;
  const icon = done ? 'check' : running ? 'pause' : 'play-arrow';

  return (
    <View className="flex-row items-center gap-gutter self-start rounded-xl bg-primary px-stack-lg py-gutter">
      <View>
        <Text className="font-mono uppercase tracking-widest text-label-sm text-on-primary-container">
          Temporizador
        </Text>
        <Text className="font-sans-bold text-display-lg leading-none text-on-primary">
          {done ? 'LISTO' : formatTime(remaining)}
        </Text>
      </View>
      <Pressable
        onPress={() => !done && setRunning((r) => !r)}
        accessibilityRole="button"
        accessibilityLabel={running ? 'Pausar temporizador' : 'Iniciar temporizador'}
        className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest">
        <MaterialIcons name={icon} size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}

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

function StepCard({
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

        <Pressable
          onPress={onToggleDone}
          className="flex-row items-center gap-stack-sm self-start">
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

export default function CookingModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getRecipe(id)
      .then((data) => {
        if (active) setRecipe(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => load(), [load]);

  function toggleDone(index: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const steps = recipe?.steps ?? [];
  const current = steps.findIndex((_, i) => !done.has(i));
  const stepStatus = (i: number): StepStatus =>
    done.has(i) ? 'done' : i === current ? 'active' : 'upcoming';

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <TopBar />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : failed ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="error-outline" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            No se pudo cargar la receta.
          </Text>
          <Pressable onPress={load} className="rounded-lg border border-primary px-gutter py-stack-md">
            <Text className="font-mono-medium text-label-md text-primary">Reintentar</Text>
          </Pressable>
        </View>
      ) : !recipe ? (
        <View className="mt-section-gap items-center px-container-padding">
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            No se encontró la receta.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-section-gap">
          <View className="gap-stack-md">
            <Text className="font-sans-bold text-display-lg text-primary">{recipe.title}</Text>
            <Text className="font-sans text-body-md text-on-surface-variant">
              {current === -1
                ? '¡Receta completada!'
                : `Paso ${current + 1} de ${steps.length}`}
            </Text>
            <View className="flex-row items-center gap-stack-md self-start rounded-lg border border-outline-variant bg-surface-container-low px-gutter py-stack-md">
              <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
              <Text className="font-mono-medium text-label-md text-primary">IA SOUS-CHEF ACTIVA</Text>
            </View>
          </View>

          <View className="gap-stack-lg pl-stack-md">
            {steps.map((step, i) => (
              <StepCard
                key={i}
                step={step}
                index={i}
                status={stepStatus(i)}
                onToggleDone={() => toggleDone(i)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
