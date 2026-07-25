import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';

import { colors } from '@recetas/theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <MaterialIcons name={name} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Oculta la barra de pestañas al abrir el teclado: así el input del chat no queda tapado.
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors['on-surface-variant'],
        tabBarStyle: {
          backgroundColor: colors['surface-container-lowest'],
          borderTopColor: colors['outline-variant'],
        },
        tabBarLabelStyle: {
          fontFamily: 'JetBrainsMono_500Medium',
          fontSize: 11,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="alacena"
        options={{ title: 'Despensa', tabBarIcon: tabIcon('kitchen') }}
      />
      <Tabs.Screen
        name="lista"
        options={{ title: 'Lista', tabBarIcon: tabIcon('shopping-basket') }}
      />
      <Tabs.Screen
        name="recetas"
        options={{ title: 'Recetas', tabBarIcon: tabIcon('menu-book') }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarIcon: tabIcon('chat-bubble-outline') }}
      />
    </Tabs>
  );
}
