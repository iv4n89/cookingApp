import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { AVATAR } from '@/features/profile/profile-content';

import { colors } from '@recetas/theme/tokens';

// Avatar with edit badge, name and email at the top of the profile.
export function ProfileHeader() {
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
