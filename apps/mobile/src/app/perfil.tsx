import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { ProfileActions } from '@/features/profile/components/profile-actions';
import { ProfileHeader } from '@/features/profile/components/profile-header';
import { SettingsRow } from '@/features/profile/components/settings-row';
import { SubscriptionCard } from '@/features/profile/components/subscription-card';
import { SETTINGS } from '@/features/profile/profile-content';

import { colors } from '@recetas/theme/tokens';

export default function PerfilScreen() {
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
        contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-lg">
        <ProfileHeader />
        <SubscriptionCard />

        <View className="gap-stack-md">
          <Text className="px-stack-sm font-mono uppercase text-label-sm text-on-surface-variant">
            Ajustes de cuenta
          </Text>
          {SETTINGS.map((row) => (
            <SettingsRow key={row.title} {...row} />
          ))}
        </View>

        <ProfileActions />
      </ScrollView>
    </SafeAreaView>
  );
}
