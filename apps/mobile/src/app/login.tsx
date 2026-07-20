import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Provider {
  id: OAuthProvider;
  label: string;
  icon: IconName;
  enabled: boolean;
}

// Google activo; Facebook y Apple quedan listos para habilitar al configurarlos.
const PROVIDERS: Provider[] = [
  { id: 'google', label: 'Continuar con Google', icon: 'google', enabled: true },
  { id: 'facebook', label: 'Continuar con Facebook', icon: 'facebook', enabled: false },
  { id: 'apple', label: 'Continuar con Apple', icon: 'apple', enabled: false },
];

function ProviderButton({
  provider,
  busy,
  disabled,
  onPress,
}: {
  provider: Provider;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const inactive = !provider.enabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || inactive}
      className={`flex-row items-center gap-stack-md rounded-lg border border-outline bg-surface-container-lowest px-gutter py-gutter ${
        disabled || inactive ? 'opacity-50' : ''
      }`}>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialCommunityIcons name={provider.icon} size={22} color={colors['on-surface']} />
      )}
      <Text className="flex-1 font-sans-medium text-body-lg text-on-surface">{provider.label}</Text>
      {inactive ? (
        <Text className="font-mono text-label-sm text-on-surface-variant">PRONTO</Text>
      ) : null}
    </Pressable>
  );
}

export default function LoginScreen() {
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: OAuthProvider) {
    if (pending) return;
    setPending(provider);
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch {
      setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setPending(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center gap-section-gap px-container-padding">
        <View className="items-center gap-stack-md">
          <Text className="font-sans-bold text-headline-md text-primary">COCINA INTELIGENTE</Text>
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Entra con tu cuenta para cocinar con tu despensa.
          </Text>
        </View>

        <View className="gap-stack-md">
          {PROVIDERS.map((provider) => (
            <ProviderButton
              key={provider.id}
              provider={provider}
              busy={pending === provider.id}
              disabled={pending !== null}
              onPress={() => signIn(provider.id)}
            />
          ))}

          {error ? <Text className="font-sans text-body-md text-error">{error}</Text> : null}
        </View>

        <Text className="text-center font-mono text-label-sm text-on-surface-variant">
          Sin contraseñas. Usamos tu cuenta para entrar.
        </Text>
      </View>
    </SafeAreaView>
  );
}
