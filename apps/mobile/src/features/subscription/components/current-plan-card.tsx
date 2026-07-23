import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Active plan summary with next billing date and quick change/price actions.
export function CurrentPlanCard() {
  return (
    <View className="gap-gutter rounded-xl border border-outline-variant bg-tertiary-fixed p-gutter">
      <View className="flex-row items-start justify-between">
        <View className="gap-stack-sm">
          <Text className="font-mono uppercase tracking-widest text-label-sm text-secondary">
            Suscripción activa
          </Text>
          <Text className="font-sans-semibold text-headline-md text-primary">Premium mensual</Text>
        </View>
        <View className="rounded-full bg-primary-container px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm text-on-primary">ACTUAL</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="event-repeat" size={18} color={colors['on-surface-variant']} />
        <Text className="font-sans text-body-md text-on-surface-variant">
          Próximo cobro: <Text className="font-sans-semibold text-on-surface">15 oct 2025</Text>
        </Text>
      </View>
      <View className="flex-row gap-stack-md">
        <Pressable className="flex-1 flex-row items-center justify-center gap-stack-sm bg-primary py-gutter">
          <MaterialIcons name="swap-horiz" size={18} color={colors['on-primary']} />
          <Text className="font-mono-medium text-label-md text-on-primary">Cambiar</Text>
        </Pressable>
        <View className="flex-1 items-center justify-center border border-outline-variant bg-surface-container-lowest py-gutter">
          <Text className="font-mono text-label-sm text-primary">2,99 € / mes</Text>
        </View>
      </View>
    </View>
  );
}
