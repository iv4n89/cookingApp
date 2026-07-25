import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { DiscoverCard } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

const VISIBLE_INGREDIENTS = 6;
const DOUBLE_TAP_MS = 300;

// One full-screen recipe page of the discoverer. Double tapping anywhere saves it (Instagram-like);
// tapping the text block opens the full recipe.
export function RecipeReel({
  card,
  height,
  saved,
  onSave,
  onOpen,
}: {
  card: DiscoverCard;
  height: number;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  const lastTap = useRef(0);

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      onSave();
      return;
    }
    lastTap.current = now;
  }

  const shown = card.ingredientNames.slice(0, VISIBLE_INGREDIENTS);
  const rest = card.ingredientNames.length - shown.length;

  return (
    <Pressable onPress={handleTap} style={{ height }} className="w-full bg-surface-container">
      {card.imageUrl ? (
        <Image
          source={card.imageUrl}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <MaterialIcons name="restaurant" size={64} color={colors['outline-variant']} />
        </View>
      )}

      <Pressable
        onPress={onSave}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Guardada' : 'Guardar receta'}
        className="absolute right-container-padding top-stack-lg h-12 w-12 items-center justify-center rounded-full bg-black/50">
        <MaterialIcons
          name={saved ? 'bookmark' : 'bookmark-border'}
          size={26}
          color={saved ? colors.primary : '#ffffff'}
        />
      </Pressable>

      {card.warnAllergens.length > 0 ? (
        <View className="absolute left-container-padding top-stack-lg flex-row items-center gap-stack-sm bg-black/60 px-stack-md py-stack-sm">
          <MaterialIcons name="warning-amber" size={16} color="#ffffff" />
          <Text className="font-mono-medium text-label-sm text-white">
            Contiene: {card.warnAllergens.join(', ')}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={onOpen}
        className="absolute bottom-0 left-0 right-0 gap-stack-md bg-black/60 p-container-padding pb-section-gap">
        <Text className="font-sans-bold text-display-lg text-white">{card.title}</Text>
        {card.description ? (
          <Text className="font-sans text-body-md text-white/90" numberOfLines={3}>
            {card.description}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-stack-sm">
          {shown.map((name, index) => (
            <View key={`${name}-${index}`} className="border border-white/40 px-stack-md py-stack-sm">
              <Text className="font-mono-medium text-label-sm text-white">{name}</Text>
            </View>
          ))}
          {rest > 0 ? (
            <View className="border border-white/40 px-stack-md py-stack-sm">
              <Text className="font-mono-medium text-label-sm text-white">+{rest} más</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Pressable>
  );
}
