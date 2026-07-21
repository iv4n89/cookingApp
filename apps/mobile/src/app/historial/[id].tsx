import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCooked, uncookRecipe, type CookedEntry } from '@/lib/cooking';
import { getRecipe, type Recipe, type RecipeStep } from '@/lib/recipes';
import { getUserRecipe } from '@/lib/user-recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <View className="flex-row items-center gap-stack-sm">
      {[1, 2, 3, 4, 5].map((value) => (
        <MaterialIcons
          key={value}
          name={value <= rating ? 'star' : 'star-border'}
          size={22}
          color={value <= rating ? colors.primary : colors['outline-variant']}
        />
      ))}
    </View>
  );
}

function StepItem({ step, index }: { step: RecipeStep; index: number }) {
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

export default function CookedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<CookedEntry | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getCooked(id)
      .then(async (cooked) => {
        if (!cooked) {
          if (active) setFailed(true);
          return;
        }
        const [recipeData, meta] = await Promise.all([
          getRecipe(cooked.recipe_id),
          getUserRecipe(cooked.recipe_id),
        ]);
        if (active) {
          setEntry(cooked);
          setRecipe(recipeData);
          setRating(meta.rating);
        }
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

  async function remove() {
    if (deleting || !entry) return;
    setDeleting(true);
    try {
      await uncookRecipe(entry.id);
      router.back();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-outline-variant bg-background px-container-padding py-stack-md">
        <View className="flex-row items-center gap-gutter">
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
            <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
          </Pressable>
          <Text className="font-sans-bold text-headline-sm text-primary">Historial</Text>
        </View>
        {entry ? (
          <Pressable
            onPress={remove}
            disabled={deleting}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Borrar del historial"
            className="h-9 w-9 items-center justify-center rounded-full bg-on-surface">
            {deleting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <MaterialIcons name="close" size={20} color={colors.background} />
            )}
          </Pressable>
        ) : null}
      </View>

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

          {rating !== null ? (
            <View className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
              <Text className="font-sans-semibold text-body-md text-on-surface">Tu valoración</Text>
              <RatingStars rating={rating} />
            </View>
          ) : null}

          {recipe && recipe.steps.length > 0 ? (
            <View className="gap-stack-lg border-t border-outline-variant pt-stack-lg">
              <Text className="font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
                Pasos
              </Text>
              {recipe.steps.map((step, i) => (
                <StepItem key={i} step={step} index={i} />
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
