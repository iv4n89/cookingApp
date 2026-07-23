import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

import { colors } from '@recetas/theme/tokens';

// Bottom account actions: sign out and help & support.
export function ProfileActions() {
  return (
    <View className="gap-stack-sm border-t border-outline-variant pt-stack-lg">
      <Pressable onPress={() => supabase.auth.signOut()} className="flex-row items-center gap-stack-md p-stack-md">
        <MaterialIcons name="logout" size={22} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">CERRAR SESIÓN</Text>
      </Pressable>
      <Pressable className="flex-row items-center gap-stack-md p-stack-md">
        <MaterialIcons name="help-outline" size={18} color={colors.outline} />
        <Text className="font-mono text-label-sm text-outline">AYUDA Y SOPORTE</Text>
      </Pressable>
    </View>
  );
}
