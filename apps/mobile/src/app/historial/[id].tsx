import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { CookedRatingStars } from '@/features/history/components/cooked-rating-stars';
import { CookedStepItem } from '@/features/history/components/cooked-step-item';
import { DeleteCookedButton } from '@/features/history/components/delete-cooked-button';
import { formatDate } from '@/features/history/format-date';
import { useCookedDetail } from '@/features/history/hooks/use-cooked-detail';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function CookedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entry, recipe, rating, loading, failed, deleting, deleteFailed, remove } = useCookedDetail(id);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <BackHeader
        title="Historial"
        right={entry ? <DeleteCookedButton deleting={deleting} onPress={remove} /> : null}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : failed || !entry ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="error-outline" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            No se pudo cargar la receta cocinada.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-lg">
          <View className="gap-stack-sm">
            <Text className="font-sans-semibold text-headline-md text-on-surface">{entry.title}</Text>
            <Text className="font-mono text-label-sm text-on-surface-variant">
              Cocinado el {formatDate(entry.cooked_at)} · {entry.servings} raciones
            </Text>
          </View>

          {deleteFailed ? (
            <Text className="font-sans text-body-md text-error">
              No se pudo borrar. Inténtalo de nuevo.
            </Text>
          ) : null}

          {rating !== null ? (
            <View className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
              <Text className="font-sans-semibold text-body-md text-on-surface">Tu valoración</Text>
              <CookedRatingStars rating={rating} />
            </View>
          ) : null}

          {recipe && recipe.steps.length > 0 ? (
            <View className="gap-stack-lg border-t border-outline-variant pt-stack-lg">
              <Text className="font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
                Pasos
              </Text>
              {recipe.steps.map((step, i) => (
                <CookedStepItem key={i} step={step} index={i} />
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() =>
              router.push({ pathname: '/receta/[id]', params: { id: entry.recipe_id, servings: entry.servings } })
            }
            className="mt-stack-md flex-row items-center justify-center gap-stack-md bg-primary py-gutter">
            <MaterialIcons name="restaurant" size={18} color={colors['on-primary']} />
            <Text className="font-mono-medium text-label-md text-on-primary">VOLVER A HACER LA RECETA</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
