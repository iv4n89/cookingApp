import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Payment method card with the saved card and an update action.
export function PaymentCard() {
  return (
    <View className="gap-stack-lg rounded-xl border border-outline-variant bg-surface-container-low p-gutter">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-semibold text-headline-sm text-primary">Método de pago</Text>
        <MaterialIcons name="verified-user" size={22} color={colors.secondary} />
      </View>
      <View className="flex-row items-center gap-gutter rounded-lg border border-outline-variant bg-surface-container-lowest p-gutter">
        <View className="h-8 w-12 items-center justify-center rounded bg-tertiary-container">
          <MaterialIcons name="credit-card" size={18} color={colors['on-tertiary']} />
        </View>
        <View>
          <Text className="font-sans-semibold text-body-md text-on-surface">Visa terminada en 1234</Text>
          <Text className="font-mono text-label-sm text-on-surface-variant">Caduca 12/2026</Text>
        </View>
      </View>
      <Pressable className="items-center border-[1.5px] border-primary py-stack-md">
        <Text className="font-mono-medium text-label-md text-primary">Actualizar método de pago</Text>
      </Pressable>
    </View>
  );
}
