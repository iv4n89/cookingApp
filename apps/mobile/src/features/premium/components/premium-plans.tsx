import { Text, View } from 'react-native';

import type { Plan } from '@/features/premium/premium-content';

import { PlanOption } from './plan-option';

// Plan selection (monthly / yearly) with intro copy.
export function PremiumPlans({ plan, onSelect }: { plan: Plan; onSelect: (plan: Plan) => void }) {
  return (
    <View className="gap-gutter px-container-padding">
      <Text className="text-center font-sans-semibold text-headline-md text-primary">
        Suscripción para acceder
      </Text>
      <Text className="text-center font-sans text-body-md text-on-surface-variant">
        Empieza tu prueba de 7 días hoy para acceder sin límites a todo lo premium.
      </Text>
      <View className="mt-stack-md gap-gutter">
        <PlanOption
          selected={plan === 'monthly'}
          onSelect={() => onSelect('monthly')}
          title="Mensual"
          price="2,99 €"
          period="/ mes"
          note="Acceso estándar a la inteligencia culinaria."
        />
        <PlanOption
          selected={plan === 'yearly'}
          onSelect={() => onSelect('yearly')}
          title="Anual"
          price="29,99 €"
          period="/ año"
          note="Equivale a 2,50 € al mes."
          bestValue
        />
      </View>
    </View>
  );
}
