import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Five-star rating selector for the current user's rating of the recipe.
export function RatingStars({
  rating,
  onRate,
}: {
  rating: number | null;
  onRate: (value: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
      <Text className="font-sans-semibold text-body-md text-on-surface">Tu valoración</Text>
      <View className="flex-row items-center gap-stack-sm">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            onPress={() => onRate(value)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`${value} estrellas`}>
            <MaterialIcons
              name={rating !== null && value <= rating ? 'star' : 'star-border'}
              size={28}
              color={rating !== null && value <= rating ? colors.primary : colors['outline-variant']}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
