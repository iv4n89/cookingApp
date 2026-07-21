import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BenefitCard } from '@/features/premium/components/benefit-card';
import { PremiumFooter } from '@/features/premium/components/premium-footer';
import { PremiumHero } from '@/features/premium/components/premium-hero';
import { PremiumPlans } from '@/features/premium/components/premium-plans';
import { BENEFITS, type Plan } from '@/features/premium/premium-content';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function PremiumScreen() {
  const [plan, setPlan] = useState<Plan>('yearly');

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-outline-variant bg-background px-container-padding py-stack-md">
        <Text className="font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="close" size={24} color={colors['on-surface-variant']} />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-stack-lg">
        <PremiumHero />

        <View className="gap-gutter px-container-padding pb-section-gap">
          {BENEFITS.map((benefit) => (
            <BenefitCard key={benefit.title} {...benefit} />
          ))}
        </View>

        <PremiumPlans plan={plan} onSelect={setPlan} />
      </ScrollView>

      <PremiumFooter plan={plan} />
    </SafeAreaView>
  );
}
