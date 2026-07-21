import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Banner that moves the checked items into the pantry when confirmed.
export function BuyCheckedBanner({ count, onBuy }: { count: number; onBuy: () => void }) {
  return (
    <View className="gap-stack-md rounded-xl bg-primary-container p-stack-lg">
      <View className="flex-row items-start gap-gutter">
        <MaterialIcons name="info" size={22} color={colors['on-primary']} />
        <Text className="flex-1 font-sans text-body-md text-on-primary opacity-90">
          Al marcar como comprado se mueven a tu despensa, sumándose a lo que ya tengas.
        </Text>
      </View>
      <Pressable onPress={onBuy} className="items-center rounded-lg bg-surface-container-lowest py-stack-md">
        <Text className="font-mono-medium text-label-md text-primary">MARCAR COMO COMPRADO ({count})</Text>
      </Pressable>
    </View>
  );
}
