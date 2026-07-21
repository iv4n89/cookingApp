import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { HERO } from '@/features/premium/premium-content';

// Hero image and headline block for the premium screen.
export function PremiumHero() {
  return (
    <>
      <Image source={HERO} style={{ width: '100%', height: 260 }} contentFit="cover" />
      <View className="items-center gap-stack-sm px-container-padding py-stack-lg">
        <View className="rounded-full bg-secondary-container px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm tracking-widest text-on-secondary-fixed">ACCESO PREMIUM</Text>
        </View>
        <Text className="text-center font-sans-bold text-display-lg text-primary">Eleva tu cocina</Text>
        <Text className="text-center font-sans text-body-lg text-on-surface-variant">
          Exprime todo el potencial de tus ingredientes con maestría culinaria potenciada por IA.
        </Text>
      </View>
    </>
  );
}
