import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

const AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCrdXRNolt1wLPn3lGhvPoKWeWXJ4OSiO2GLXdvTW6h1GBkP6svm5WoYlq4myUT2z2rsGNmfr3wTk8DJl3_fQywUnrMf1iOdVKQCp4PEdWGUgqnDpq2p2BMx4G5aE3G_NwBn2mIUKJnDFi7mn0hcuMRgK1mTTN0k9BAJymh3C8cKizYRaemSnC_55g3Ig6ia_E7YqKAHhL0PO45UqciDeOGlHCUfZg0YT91A3C4Ji1YL4ZMxWsWe3X561WZG-GwBTRkuGQEitX0MLS2';

const SETTINGS: { icon: IconName; title: string; subtitle: string }[] = [
  { icon: 'person', title: 'Información personal', subtitle: 'Actualiza nombre, email y preferencias' },
  { icon: 'menu-book', title: 'Mis recetas', subtitle: '42 recetas guardadas por la IA' },
  { icon: 'tune', title: 'Preferencias', subtitle: 'Restricciones dietéticas y tema' },
];

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

function ProfileHeader() {
  return (
    <View className="items-center gap-stack-md py-stack-lg">
      <View className="rounded-full border-2 border-primary p-1">
        <Image source={AVATAR} style={{ width: 120, height: 120, borderRadius: 60 }} contentFit="cover" />
        <View className="absolute bottom-0 right-0 rounded-full border-2 border-background bg-primary p-stack-sm">
          <MaterialIcons name="edit" size={18} color={colors['on-primary']} />
        </View>
      </View>
      <View className="items-center gap-stack-sm">
        <Text className="font-sans-bold text-display-lg text-on-surface">Alex Thompson</Text>
        <Text className="font-mono uppercase tracking-wider text-label-md text-on-surface-variant">
          alex.thompson@cocina.app
        </Text>
      </View>
    </View>
  );
}

function SubscriptionCard() {
  return (
    <View className="flex-row items-center justify-between gap-stack-md rounded-xl border border-outline-variant bg-secondary-container p-stack-lg">
      <View className="flex-1 gap-stack-sm">
        <View className="flex-row items-center gap-stack-sm">
          <MaterialIcons name="workspace-premium" size={22} color={colors.primary} />
          <Text className="font-mono-medium text-label-md text-on-secondary-fixed">
            MEMBRESÍA PREMIUM
          </Text>
        </View>
        <Text className="font-sans text-body-md text-on-secondary-fixed-variant">
          Tu suscripción está activa.
        </Text>
      </View>
      <Pressable
        onPress={() => router.push('/suscripcion')}
        className="rounded-lg bg-primary px-stack-lg py-stack-md">
        <Text className="font-mono-medium text-label-md text-on-primary">GESTIONAR</Text>
      </Pressable>
    </View>
  );
}

function SettingsRow({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  return (
    <Pressable className="flex-row items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
      <View className="flex-1 flex-row items-center gap-stack-md">
        <View className="h-10 w-10 items-center justify-center rounded bg-tertiary-fixed">
          <MaterialIcons name={icon} size={22} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold text-headline-sm text-on-surface">{title}</Text>
          <Text className="font-mono text-label-sm text-on-surface-variant">{subtitle}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
    </Pressable>
  );
}

export default function PerfilScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <TopBar />
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

        <View className="gap-stack-sm border-t border-outline-variant pt-stack-lg">
          <Pressable
            onPress={() => supabase.auth.signOut()}
            className="flex-row items-center gap-stack-md p-stack-md">
            <MaterialIcons name="logout" size={22} color={colors['on-surface-variant']} />
            <Text className="font-mono-medium text-label-md text-on-surface-variant">
              CERRAR SESIÓN
            </Text>
          </Pressable>
          <Pressable className="flex-row items-center gap-stack-md p-stack-md">
            <MaterialIcons name="help-outline" size={18} color={colors.outline} />
            <Text className="font-mono text-label-sm text-outline">AYUDA Y SOPORTE</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
