import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type Mode = 'signin' | 'signup';

function Field({
  label,
  value,
  onChangeText,
  secure,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secure?: boolean;
  keyboardType?: 'email-address' | 'default';
}) {
  return (
    <View className="gap-stack-sm">
      <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors['outline-variant']}
        className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
      />
    </View>
  );
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignIn = mode === 'signin';

  async function submit() {
    setLoading(true);
    setError(null);
    setNotice(null);
    if (isSignIn) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (!data.session) setNotice('Cuenta creada. Revisa tu email para confirmarla.');
    }
    setLoading(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center gap-section-gap px-container-padding">
        <View className="items-center gap-stack-sm">
          <Text className="font-sans-bold text-headline-md text-primary">COCINA INTELIGENTE</Text>
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            {isSignIn ? 'Entra para cocinar con tu alacena.' : 'Crea tu cuenta y empieza a cocinar.'}
          </Text>
        </View>

        <View className="gap-stack-lg">
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Contraseña" value={password} onChangeText={setPassword} secure />

          {error ? (
            <Text className="font-sans text-body-md text-error">{error}</Text>
          ) : null}
          {notice ? (
            <Text className="font-sans text-body-md text-primary">{notice}</Text>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={loading || !email || !password}
            className={`items-center rounded-lg bg-primary py-gutter ${
              loading || !email || !password ? 'opacity-50' : ''
            }`}>
            <Text className="font-mono-medium uppercase tracking-widest text-label-md text-on-primary">
              {loading ? 'Un momento…' : isSignIn ? 'Iniciar sesión' : 'Crear cuenta'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setMode(isSignIn ? 'signup' : 'signin');
            setError(null);
            setNotice(null);
          }}
          className="items-center">
          <Text className="font-mono text-label-md text-on-surface-variant">
            {isSignIn ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Inicia sesión'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
