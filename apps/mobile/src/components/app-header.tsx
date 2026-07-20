import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD3GQyyYY1hF0nWbUCAsqZA4TrOGfiNJsshiKMyPfcT8r8EPCOkIHMDx_mqCIGq1FeswhrxbLJfq_uhpqXV_TJ-LQX8-RjotJETpDJjY1Vb_VJ9P6jhdAbi2pSthp2NWnlllmJ05yy8I1oBQ01X_5xlKjrvvcIZp-Vxby0LsqRb8pAG1raemeCvDIvfXJGJohmP6XWoyVSvfTRGaJtPK-mvQeVfeCAkL7LqZR5eKWG-YBwMWaZd2zSuO5RiH_5AHAyGlHfe_JGFEBDW';

export function AppHeader() {
  return (
    <View className="flex-row items-center justify-between border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable
        onPress={() => router.push('/perfil')}
        hitSlop={8}
        className="flex-row items-center gap-gutter">
        <Image
          source={AVATAR}
          style={{ width: 40, height: 40, borderRadius: 20 }}
          contentFit="cover"
        />
        <Text className="font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
      </Pressable>
      <Pressable hitSlop={8}>
        <MaterialIcons name="search" size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}
