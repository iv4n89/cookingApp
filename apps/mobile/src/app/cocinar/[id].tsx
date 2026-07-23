import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { StepCard } from '@/features/cooking/components/step-card';
import { useCooking } from '@/features/cooking/hooks/use-cooking';

import { colors } from '@recetas/theme/tokens';

export default function CookingModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipe, loading, failed, reload, steps, current, toggleDone, stepStatus } = useCooking(id);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <BackHeader title="COCINA INTELIGENTE" />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : failed ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="error-outline" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            No se pudo cargar la receta.
          </Text>
          <Pressable onPress={reload} className="rounded-lg border border-primary px-gutter py-stack-md">
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
              {current === -1 ? '¡Receta completada!' : `Paso ${current + 1} de ${steps.length}`}
            </Text>
            <View className="flex-row items-center gap-stack-md self-start rounded-lg border border-outline-variant bg-surface-container-low px-gutter py-stack-md">
              <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
              <Text className="font-mono-medium text-label-md text-primary">IA SOUS-CHEF ACTIVA</Text>
            </View>
          </View>

          <View className="gap-stack-lg pl-stack-md">
            {steps.map((step, i) => (
              <StepCard key={i} step={step} index={i} status={stepStatus(i)} onToggleDone={() => toggleDone(i)} />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
