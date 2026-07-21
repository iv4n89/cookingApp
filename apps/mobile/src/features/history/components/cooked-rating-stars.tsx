import { MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Read-only five-star display of a rating.
export function CookedRatingStars({ rating }: { rating: number }) {
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
