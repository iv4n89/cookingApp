import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Premium membership card with a shortcut to manage the subscription.
export function SubscriptionCard() {
  return (
    <View className="flex-row items-center justify-between gap-stack-md rounded-xl border border-outline-variant bg-secondary-container p-stack-lg">
      <View className="flex-1 gap-stack-sm">
        <View className="flex-row items-center gap-stack-sm">
          <MaterialIcons name="workspace-premium" size={22} color={colors.primary} />
          <Text className="font-mono-medium text-label-md text-on-secondary-fixed">MEMBRESÍA PREMIUM</Text>
        </View>
        <Text className="font-sans text-body-md text-on-secondary-fixed-variant">
          Tu suscripción está activa.
        </Text>
      </View>
      <Pressable onPress={() => router.push('/suscripcion')} className="rounded-lg bg-primary px-stack-lg py-stack-md">
        <Text className="font-mono-medium text-label-md text-on-primary">GESTIONAR</Text>
      </Pressable>
    </View>
  );
}
