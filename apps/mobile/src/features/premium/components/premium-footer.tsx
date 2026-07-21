import { Pressable, Text, View } from 'react-native';

import type { Plan } from '@/features/premium/premium-content';

// Bottom call to action and legal links for the premium screen.
export function PremiumFooter({ plan }: { plan: Plan }) {
  return (
    <View className="items-center gap-stack-md border-t border-outline-variant bg-surface-container-lowest px-container-padding py-stack-lg">
      <Pressable className="w-full items-center rounded-full bg-primary py-gutter">
        <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
          {plan === 'yearly' ? 'Empezar prueba de 7 días' : 'Suscribirme ahora'}
        </Text>
      </Pressable>
      <Text className="text-center font-mono text-label-sm text-on-surface-variant">
        Acceso completo. Cancela cuando quieras. El cobro empieza tras la prueba de 7 días.
      </Text>
      <View className="flex-row gap-section-gap">
        <Text className="font-mono text-label-sm text-on-surface-variant">Restaurar compra</Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">Términos</Text>
      </View>
    </View>
  );
}
