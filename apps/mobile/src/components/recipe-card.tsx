import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useRecipeImage } from '@/lib/recipe-image';
import type { ImageStatus } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

export interface RecipeCardData {
  id: string;
  image: string | null;
  imageStatus: ImageStatus;
  badgeIcon: IconName;
  badge: string;
  title: string;
  description: string;
  tags: string[];
}

export function RecipeCard({
  recipe,
  onPress,
  saved,
  onToggleSave,
}: {
  recipe: RecipeCardData;
  onPress?: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  const { image, pending } = useRecipeImage(recipe.id, recipe.image, recipe.imageStatus);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="bg-card border border-card-border rounded-xl overflow-hidden">
      <View className="h-56 w-full items-center justify-center bg-surface-container">
        {image ? (
          <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : pending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <MaterialIcons name="restaurant-menu" size={40} color={colors['outline-variant']} />
        )}
        <View className="absolute top-stack-md left-stack-md flex-row items-center gap-stack-sm bg-tertiary-fixed px-stack-md py-stack-sm">
          <MaterialIcons name={recipe.badgeIcon} size={14} color={colors['on-tertiary-fixed']} />
          <Text className="font-mono-medium text-label-sm text-on-tertiary-fixed">
            {recipe.badge}
          </Text>
        </View>
      </View>

      <View className="p-stack-lg">
        <View className="mb-stack-sm flex-row items-start justify-between">
          <Text className="flex-1 pr-stack-md font-sans-semibold text-headline-sm text-on-surface">
            {recipe.title}
          </Text>
          {onToggleSave ? (
            <Pressable
              onPress={onToggleSave}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Quitar de guardadas' : 'Guardar receta'}>
              <MaterialIcons
                name={saved ? 'bookmark' : 'bookmark-border'}
                size={22}
                color={saved ? colors.primary : colors.outline}
              />
            </Pressable>
          ) : (
            <MaterialIcons name="bookmark-border" size={22} color={colors.outline} />
          )}
        </View>

        <Text
          className="mb-stack-md font-sans text-body-md text-on-surface-variant"
          numberOfLines={2}>
          {recipe.description}
        </Text>

        <View className="flex-row flex-wrap gap-stack-sm">
          {recipe.tags.map((tag) => (
            <View
              key={tag}
              className="border border-outline-variant bg-background px-stack-md py-stack-sm">
              <Text className="font-mono-medium text-label-sm text-on-surface">{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}
