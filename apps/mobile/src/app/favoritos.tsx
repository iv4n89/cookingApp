import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listFavorites, type FavoriteRecipe } from '@/lib/user-recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function TopBar() {
  return (
    <View className="flex-row items-center gap-gutter border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text className="font-sans-bold text-headline-sm text-primary">Favoritos</Text>
    </View>
  );
}

function Stars({ rating }: { rating: number | null }) {
  return (
    <View className="flex-row items-center gap-stack-sm">
      {[1, 2, 3, 4, 5].map((value) => (
        <MaterialIcons
          key={value}
          name={rating !== null && value <= rating ? 'star' : 'star-border'}
          size={16}
          color={rating !== null && value <= rating ? colors.primary : colors['outline-variant']}
        />
      ))}
    </View>
  );
}

export default function FavoritosScreen() {
  const [entries, setEntries] = useState<FavoriteRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    listFavorites()
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <TopBar />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : entries.length === 0 ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="favorite-border" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Aún no tienes recetas favoritas.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-md">
          {entries.map((recipe) => (
            <Pressable
              key={recipe.id}
              onPress={() => router.push({ pathname: '/receta/[id]', params: { id: recipe.id } })}
              className="gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
              <View className="flex-row items-center justify-between gap-gutter">
                <Text className="flex-1 font-sans-semibold text-body-md text-on-surface">{recipe.title}</Text>
                <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-label-sm text-on-surface-variant">
                  {recipe.prep_time_min + recipe.cook_time_min} MIN
                </Text>
                <Stars rating={recipe.rating} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
