import { Pressable, Text, View } from 'react-native';

// Support prompt and cancel-subscription section at the bottom of the manage-subscription screen.
export function SubscriptionFooter() {
  return (
    <>
      <View className="items-center gap-stack-md pt-stack-lg">
        <Text className="font-sans text-body-md text-on-surface-variant">¿Dudas con tu facturación?</Text>
        <Pressable className="border-b border-primary pb-stack-sm">
          <Text className="font-mono-medium text-label-md text-primary">Contactar con soporte</Text>
        </Pressable>
      </View>

      <View className="mt-section-gap items-center gap-stack-md border-t border-outline-variant pt-section-gap">
        <Pressable className="px-gutter py-stack-md">
          <Text className="font-mono text-label-sm uppercase tracking-widest text-on-surface-variant">
            Cancelar suscripción
          </Text>
        </Pressable>
        <Text className="max-w-xs text-center font-mono text-[11px] leading-relaxed text-on-tertiary-container">
          Si cancelas, perderás el acceso a los análisis de despensa con IA al final del ciclo de
          facturación actual.
        </Text>
      </View>
    </>
  );
}
