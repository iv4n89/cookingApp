import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <MaterialIcons name={name} size={size} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
        options={{ title: 'Alacena', tabBarIcon: tabIcon('kitchen') }}
      />
      <Tabs.Screen
        name="lista"
        options={{ title: 'Lista', tabBarIcon: tabIcon('shopping-basket') }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarIcon: tabIcon('chat-bubble-outline') }}
      />
    </Tabs>
  );
}
