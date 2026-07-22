import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Floating action button: discounts the pantry (with confirmation) and enters cooking mode.
// When the recipe was already cooked this session, it just re-enters without discounting again.
export function StartCookingButton({
  cooking,
  cooked,
  onPress,
}: {
  cooking: boolean;
  cooked: boolean;
  onPress: () => void;
}) {
  return (
    <View className="absolute bottom-8 right-container-padding">
      <Pressable
        onPress={onPress}
        disabled={cooking}
        className={`flex-row items-center gap-stack-md bg-primary px-stack-lg py-gutter ${
          cooking ? 'opacity-70' : ''
        }`}>
        {cooking ? (
          <ActivityIndicator color={colors['on-primary']} />
        ) : (
          <MaterialIcons name={cooked ? 'restaurant' : 'play-arrow'} size={22} color={colors['on-primary']} />
        )}
        <Text className="font-mono-medium text-label-md tracking-widest text-on-primary">
          {cooked ? 'SEGUIR COCINANDO' : 'EMPEZAR A COCINAR'}
        </Text>
      </Pressable>
    </View>
  );
}
