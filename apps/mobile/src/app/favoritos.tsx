import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { FavoriteRow } from '@/features/favorites/components/favorite-row';
import { useFavorites } from '@/features/favorites/hooks/use-favorites';

import { colors } from '@recetas/theme/tokens';

export default function FavoritosScreen() {
  const { entries, loading } = useFavorites();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <BackHeader title="Favoritos" />

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
            <FavoriteRow
              key={recipe.id}
              recipe={recipe}
              onPress={() => router.push({ pathname: '/receta/[id]', params: { id: recipe.id } })}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
