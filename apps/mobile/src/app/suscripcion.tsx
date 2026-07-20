import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

function TopBar() {
  return (
    <View className="flex-row items-center justify-between border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <View className="flex-1 flex-row items-center gap-gutter">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text className="font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
      </View>
      <Pressable hitSlop={8}>
        <MaterialIcons name="search" size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function InsightChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View className="flex-row items-center gap-stack-sm border border-outline-variant bg-tertiary-fixed px-stack-md py-stack-sm">
      <MaterialIcons name={icon} size={16} color={colors['on-tertiary-fixed-variant']} />
      <Text className="font-mono text-label-sm text-on-tertiary-fixed-variant">{label}</Text>
    </View>
  );
}

function CurrentPlanCard() {
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

function PaymentCard() {
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

export default function ManageSubscriptionScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <TopBar />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-md">
        <View className="mb-stack-md gap-stack-sm">
          <Text className="font-sans-bold text-display-lg text-primary">Gestionar plan</Text>
          <Text className="font-sans text-body-md text-on-surface-variant">
            Administra tu suscripción, ciclos de facturación y método de pago.
          </Text>
        </View>

        <CurrentPlanCard />
        <PaymentCard />

        <View className="flex-row flex-wrap gap-stack-sm">
          <InsightChip icon="auto-awesome" label="MARIDAJE SENSORIAL INCLUIDO" />
          <InsightChip icon="verified" label="AHORRO ANUAL DISPONIBLE" />
        </View>

        <Pressable className="flex-row items-center justify-between border-b border-outline-variant p-gutter">
          <View className="flex-row items-center gap-stack-md">
            <MaterialIcons name="receipt-long" size={22} color={colors['on-surface-variant']} />
            <Text className="font-sans text-body-md text-on-surface">Historial de facturación</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors['on-surface-variant']} />
        </Pressable>

        <View className="items-center gap-stack-md pt-stack-lg">
          <Text className="font-sans text-body-md text-on-surface-variant">
            ¿Dudas con tu facturación?
          </Text>
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
            Si cancelas, perderás el acceso a los análisis de alacena con IA al final del ciclo de
            facturación actual.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
