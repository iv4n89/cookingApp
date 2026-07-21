import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Floating action button: discounts the pantry and enters cooking mode.
export function StartCookingButton({ cooking, onPress }: { cooking: boolean; onPress: () => void }) {
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
          <MaterialIcons name="play-arrow" size={22} color={colors['on-primary']} />
        )}
        <Text className="font-mono-medium text-label-md tracking-widest text-on-primary">EMPEZAR A COCINAR</Text>
      </Pressable>
    </View>
  );
}
