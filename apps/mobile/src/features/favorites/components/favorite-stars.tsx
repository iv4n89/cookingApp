import { MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Read-only five-star rating display, tolerating a null rating.
export function FavoriteStars({ rating }: { rating: number | null }) {
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
