import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/auth';
import {
  addIngredientsToShopping,
  getRecipe,
  type Recipe,
  type RecipeIngredient,
  type RecipeStep,
} from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function sourceLabel(recipe: Recipe): string {
  if (recipe.source === 'generated') return 'GENERADO POR IA';
  if (recipe.source_url) {
    try {
      return new URL(recipe.source_url).hostname.replace(/^www\./, '').toUpperCase();
    } catch {
      return 'WEB';
    }
  }
  return 'WEB';
}

function quantityLine(ingredient: RecipeIngredient): string {
  return [ingredient.quantity, ingredient.unit].filter((v) => v !== null && v !== '').join(' ');
}

function stepDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  return mins >= 1 ? `${mins} min` : `${seconds}s`;
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

function Hero({ recipe }: { recipe: Recipe }) {
  return (
    <View className="relative aspect-[3/2] w-full items-center justify-center bg-surface-container">
      {recipe.image_url ? (
        <Image source={recipe.image_url} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <MaterialIcons name="restaurant-menu" size={48} color={colors['outline-variant']} />
      )}
      <View className="absolute bottom-6 right-6 flex-row items-center gap-stack-md border border-outline-variant bg-secondary-container px-stack-md py-stack-sm">
        <Text className="font-mono text-label-sm text-on-secondary-container">FUENTE:</Text>
        <Text className="font-mono-medium text-label-sm text-on-secondary-container">
          {sourceLabel(recipe)}
        </Text>
      </View>
    </View>
  );
}

function MetaRow({ recipe }: { recipe: Recipe }) {
  const total = recipe.prep_time_min + recipe.cook_time_min;
  return (
    <View className="flex-row flex-wrap items-center gap-gutter">
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="schedule" size={18} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">{total} MIN</Text>
      </View>
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="restaurant" size={18} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">
          {recipe.servings} RACIONES
        </Text>
      </View>
    </View>
  );
}

function Ingredients({ recipe }: { recipe: Recipe }) {
  const { session } = useSession();
  const [added, setAdded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function addAll() {
    if (added || submitting || !session) return;
    setSubmitting(true);
    setFailed(false);
    try {
      await addIngredientsToShopping(session.user.id, recipe.ingredients);
      setAdded(true);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <View className="mb-stack-md flex-row items-center justify-between">
        <Text className="font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
          Ingredientes
        </Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">
          {recipe.ingredients.length} ITEMS
        </Text>
      </View>
      <View className="mb-stack-lg gap-stack-md">
        {recipe.ingredients.map((ingredient, i) => (
          <View
            key={`${ingredient.name}-${i}`}
            className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
            <View className="flex-1 flex-row items-center gap-stack-md">
              <View className="h-2 w-2 rounded-full bg-primary" />
              <Text className="flex-1 font-sans text-body-md text-on-surface">{ingredient.name}</Text>
            </View>
            <Text className="font-mono text-label-sm text-on-surface-variant">
              {quantityLine(ingredient)}
            </Text>
          </View>
        ))}
      </View>
      {failed ? (
        <Text className="mb-stack-md font-sans text-body-md text-error">
          No se pudo añadir a la compra. Inténtalo de nuevo.
        </Text>
      ) : null}
      <Pressable
        onPress={addAll}
        disabled={added || submitting}
        className={`flex-row items-center justify-center gap-stack-md bg-primary py-gutter ${
          added || submitting ? 'opacity-60' : ''
        }`}>
        {submitting ? (
          <ActivityIndicator color={colors['on-primary']} />
        ) : (
          <MaterialIcons
            name={added ? 'check' : 'add-shopping-cart'}
            size={18}
            color={colors['on-primary']}
          />
        )}
        <Text className="font-mono-medium text-label-md text-on-primary">
          {added ? 'AÑADIDO A LA COMPRA' : submitting ? 'AÑADIENDO…' : 'AÑADIR A LA COMPRA'}
        </Text>
      </Pressable>
    </View>
  );
}

function StepItem({ step, index }: { step: RecipeStep; index: number }) {
  const number = String(index + 1).padStart(2, '0');
  const duration = stepDuration(step.timerSeconds);
  return (
    <View className="flex-row gap-gutter">
      <Text className="font-sans-semibold text-primary opacity-[0.15]" style={{ fontSize: 40, lineHeight: 40 }}>
        {number}
      </Text>
      <View className="flex-1">
        <Text className="font-sans text-body-md leading-relaxed text-on-surface-variant">
          {step.instruction}
        </Text>
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

function Stats({ recipe }: { recipe: Recipe }) {
  const tiles = [
    { label: 'RACIONES', value: String(recipe.servings) },
    { label: 'PREP', value: `${recipe.prep_time_min} MIN` },
    { label: 'COCCIÓN', value: `${recipe.cook_time_min} MIN` },
    { label: 'CALORÍAS', value: recipe.calories ? `${recipe.calories}` : '—' },
  ];
  return (
    <View className="flex-row flex-wrap gap-gutter border-t border-outline-variant pt-stack-lg">
      {tiles.map((tile) => (
        <View
          key={tile.label}
          className="flex-1 basis-[45%] items-center border border-outline-variant bg-surface p-gutter">
          <Text className="mb-stack-sm font-mono text-label-sm text-on-surface-variant">{tile.label}</Text>
          <Text className="font-sans-semibold text-headline-sm text-primary">{tile.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
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
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="search-off" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            No se encontró la receta.
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <ScrollView className="flex-1" contentContainerClassName="pb-40">
            <Hero recipe={recipe} />
            <View className="-mt-8 px-container-padding">
              <View className="gap-section-gap border border-outline-variant bg-surface-container-lowest p-stack-lg">
                <View className="gap-stack-md border-b border-outline-variant pb-stack-lg">
                  <Text className="font-sans-bold text-display-lg text-primary">{recipe.title}</Text>
                  <MetaRow recipe={recipe} />
                </View>

                {recipe.description ? (
                  <Text className="font-sans text-body-lg leading-relaxed text-on-surface-variant">
                    {recipe.description}
                  </Text>
                ) : null}

                <Ingredients recipe={recipe} />

                <View>
                  <Text className="mb-stack-md font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
                    Preparación
                  </Text>
                  <View className="gap-section-gap">
                    {recipe.steps.map((step, i) => (
                      <StepItem key={i} step={step} index={i} />
                    ))}
                  </View>
                </View>

                <Stats recipe={recipe} />
              </View>
            </View>
          </ScrollView>

          <View className="absolute bottom-8 right-container-padding">
            <Pressable
              onPress={() => router.push({ pathname: '/cocinar/[id]', params: { id: recipe.id } })}
              className="flex-row items-center gap-stack-md bg-primary px-stack-lg py-gutter">
              <MaterialIcons name="play-arrow" size={22} color={colors['on-primary']} />
              <Text className="font-mono-medium text-label-md tracking-widest text-on-primary">
                EMPEZAR A COCINAR
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
