import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

const HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA13SnPpTTbu4kEZLOofHxwBlENMcq3ccAuaj8rmgt6HV0pIbNn20YsczVaysCBWbLW6sLFYhxr0zrBVYbhEcjirTOc3fUOQ6WNSQZVVf31S9z-GJaEP1x4-DUbTfSVWRe_a2skJnPBiCilNLIWe7ORlpSEFKtkHe8xqxR1nHZwMHbRJvDq3tgsTeN-_UGx0TWPY1u6KJoUVeZprFMzRyWup63XKIOL5uMbqisttNA_geUqyAZxVmz_-GsMMkOK5P1vVDz44uCj8AFF';

const BENEFITS: { icon: IconName; title: string; text: string; tag: string }[] = [
  {
    icon: 'auto-awesome',
    title: 'Generación de recetas con IA',
    text: 'Convierte cualquier conjunto de ingredientes en platos de nivel chef con nuestra inteligencia sous-chef.',
    tag: 'ENCAJA CON TUS MACROS',
  },
  {
    icon: 'kitchen',
    title: 'Despensa ilimitada',
    text: 'No pierdas la pista de ningún ingrediente. Alertas de caducidad y sugerencias de reposición en tiempo real.',
    tag: 'MARIDAJE SENSORIAL',
  },
  {
    icon: 'verified-user',
    title: 'Experiencia solo premium',
    text: 'Un entorno sin anuncios centrado en tu cocina. Sin distracciones, solo inspiración culinaria.',
    tag: 'PILAR CENTRAL',
  },
];

function BenefitCard({ icon, title, text, tag }: (typeof BENEFITS)[number]) {
  return (
    <View className="gap-gutter rounded-xl border border-card-border bg-tertiary-fixed p-stack-lg">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
        <MaterialIcons name={icon} size={24} color={colors['on-primary']} />
      </View>
      <Text className="font-sans-semibold text-headline-sm text-primary">{title}</Text>
      <Text className="font-sans text-body-md text-on-surface-variant">{text}</Text>
      <View className="self-start rounded bg-primary-fixed px-stack-md py-stack-sm">
        <Text className="font-mono text-label-sm text-primary-container">{tag}</Text>
      </View>
    </View>
  );
}

function PlanOption({
  selected,
  onSelect,
  title,
  price,
  period,
  note,
  bestValue,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  period: string;
  note: string;
  bestValue?: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={`rounded-xl border-2 bg-surface-container-lowest p-stack-lg ${
        selected ? 'border-primary' : 'border-outline-variant'
      }`}>
      {bestValue ? (
        <View className="absolute -top-3 right-6 rounded-full bg-secondary px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm text-on-secondary">MEJOR VALOR</Text>
        </View>
      ) : null}
      <View className="mb-stack-sm flex-row items-center justify-between">
        <Text className="font-sans-semibold text-headline-sm text-on-surface">{title}</Text>
        <View
          className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
            selected ? 'border-primary bg-primary' : 'border-outline-variant'
          }`}>
          {selected ? <View className="h-2 w-2 rounded-full bg-on-primary" /> : null}
        </View>
      </View>
      <View className="flex-row items-baseline gap-stack-sm">
        <Text className="font-sans-bold text-display-lg text-primary">{price}</Text>
        <Text className="font-sans text-body-md text-on-surface-variant">{period}</Text>
      </View>
      <Text className="mt-stack-sm font-sans text-body-md italic text-on-surface-variant">{note}</Text>
    </Pressable>
  );
}

export default function PremiumScreen() {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-outline-variant bg-background px-container-padding py-stack-md">
        <Text className="font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="close" size={24} color={colors['on-surface-variant']} />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-stack-lg">
        <Image source={HERO} style={{ width: '100%', height: 260 }} contentFit="cover" />
        <View className="items-center gap-stack-sm px-container-padding py-stack-lg">
          <View className="rounded-full bg-secondary-container px-stack-md py-stack-sm">
            <Text className="font-mono text-label-sm tracking-widest text-on-secondary-fixed">
              ACCESO PREMIUM
            </Text>
          </View>
          <Text className="text-center font-sans-bold text-display-lg text-primary">
            Eleva tu cocina
          </Text>
          <Text className="text-center font-sans text-body-lg text-on-surface-variant">
            Exprime todo el potencial de tus ingredientes con maestría culinaria potenciada por IA.
          </Text>
        </View>

        <View className="gap-gutter px-container-padding pb-section-gap">
          {BENEFITS.map((benefit) => (
            <BenefitCard key={benefit.title} {...benefit} />
          ))}
        </View>

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
              onSelect={() => setPlan('monthly')}
              title="Mensual"
              price="2,99 €"
              period="/ mes"
              note="Acceso estándar a la inteligencia culinaria."
            />
            <PlanOption
              selected={plan === 'yearly'}
              onSelect={() => setPlan('yearly')}
              title="Anual"
              price="29,99 €"
              period="/ año"
              note="Equivale a 2,50 € al mes."
              bestValue
            />
          </View>
        </View>
      </ScrollView>

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
    </SafeAreaView>
  );
}
