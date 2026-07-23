import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { CurrentPlanCard } from '@/features/subscription/components/current-plan-card';
import { InsightChip } from '@/features/subscription/components/insight-chip';
import { PaymentCard } from '@/features/subscription/components/payment-card';
import { SubscriptionFooter } from '@/features/subscription/components/subscription-footer';

import { colors } from '@recetas/theme/tokens';

export default function ManageSubscriptionScreen() {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <BackHeader
        title="COCINA INTELIGENTE"
        right={
          <Pressable hitSlop={8}>
            <MaterialIcons name="search" size={24} color={colors.primary} />
          </Pressable>
        }
      />
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

        <SubscriptionFooter />
      </ScrollView>
    </SafeAreaView>
  );
}
