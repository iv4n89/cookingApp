import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Checkbox } from '@/components/checkbox';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

const SMART_ADDS: { id: string; icon: IconName; name: string; status: string }[] = [
  { id: 'eggs', icon: 'egg', name: 'Huevos L (docena)', status: 'STOCK BAJO EN ALACENA' },
  { id: 'milk', icon: 'water-drop', name: 'Leche entera', status: 'SE ACABA PRONTO' },
];

interface ListItem {
  id: string;
  name: string;
  note: string;
}

const CATEGORIES: { title: string; items: ListItem[] }[] = [
  {
    title: 'FRESCOS',
    items: [
      { id: 'mushrooms', name: 'Setas silvestres (500 g)', note: 'Para Risotto de setas' },
      { id: 'thyme', name: 'Tomillo fresco', note: 'Para Risotto de setas' },
      { id: 'shallots', name: 'Chalotas (3 uds)', note: 'Para Risotto de setas' },
    ],
  },
  {
    title: 'LÁCTEOS Y REFRIGERADOS',
    items: [
      { id: 'parmesan', name: 'Parmigiano Reggiano', note: 'Para Risotto de setas' },
      { id: 'butter', name: 'Mantequilla sin sal', note: 'Para Risotto de setas' },
    ],
  },
];

function SmartAddCard({ icon, name, status }: { icon: IconName; name: string; status: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-outline-variant bg-tertiary-fixed p-gutter">
      <View className="flex-1 flex-row items-center gap-gutter">
        <View className="rounded-lg bg-surface-container-lowest p-stack-md">
          <MaterialIcons name={icon} size={22} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="mb-stack-sm font-sans-semibold text-body-md text-on-surface">{name}</Text>
          <View className="self-start rounded bg-secondary-container px-stack-md py-stack-sm">
            <Text className="font-mono text-label-sm text-on-secondary-container">{status}</Text>
          </View>
        </View>
      </View>
      <Pressable hitSlop={8}>
        <MaterialIcons name="add-circle-outline" size={26} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ListItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <View className="flex-row items-center gap-gutter rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
      <Checkbox checked={checked} onToggle={onToggle} />
      <View className="flex-1">
        <Text
          className={`font-sans-medium text-body-md ${
            checked ? 'text-on-surface-variant line-through' : 'text-on-surface'
          }`}>
          {item.name}
        </Text>
        <Text className="font-sans text-label-sm italic text-on-surface-variant">{item.note}</Text>
      </View>
    </View>
  );
}

export default function ListaScreen() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const count = Object.values(checked).filter(Boolean).length;

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-section-gap">
        <View className="gap-gutter">
          <View className="gap-stack-sm">
            <Text className="font-sans-bold text-display-lg text-primary">Lista de la compra</Text>
            <Text className="font-sans text-body-md text-on-surface-variant">
              Reúne tus ingredientes de la semana.
            </Text>
          </View>
          <Pressable className="flex-row items-center gap-stack-sm self-start rounded-lg bg-primary px-gutter py-stack-md">
            <MaterialIcons name="add" size={16} color={colors['on-primary']} />
            <Text className="font-mono-medium text-label-md text-on-primary">AÑADIR MANUALMENTE</Text>
          </Pressable>
        </View>

        <View className="gap-stack-md">
          <View className="flex-row items-center gap-stack-sm">
            <MaterialIcons name="auto-awesome" size={18} color={colors['primary-container']} />
            <Text className="font-mono-medium text-label-md tracking-widest text-primary">
              AÑADIDOS INTELIGENTES IA
            </Text>
          </View>
          <View className="gap-gutter">
            {SMART_ADDS.map((add) => (
              <SmartAddCard key={add.id} icon={add.icon} name={add.name} status={add.status} />
            ))}
          </View>
        </View>

        <View className="gap-stack-lg">
          <Text className="font-sans-semibold text-headline-sm text-primary">Por comprar</Text>
          {CATEGORIES.map((category) => (
            <View key={category.title} className="gap-stack-md">
              <View className="border-b border-outline-variant pb-stack-sm">
                <Text className="font-mono-medium text-label-md text-on-surface-variant">
                  {category.title}
                </Text>
              </View>
              <View className="gap-base">
                {category.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    checked={!!checked[item.id]}
                    onToggle={() => toggle(item.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>

        <View className="gap-stack-md rounded-xl bg-primary-container p-stack-lg">
          <View className="flex-row items-start gap-gutter">
            <MaterialIcons name="info" size={22} color={colors['on-primary']} />
            <View className="flex-1">
              <Text className="mb-stack-sm font-sans-semibold text-headline-sm text-on-primary">
                Actualización automática del inventario
              </Text>
              <Text className="font-sans text-body-md text-on-primary opacity-90">
                Lo que marques como comprado se añade a tu alacena digital y actualiza tu stock para
                futuras recetas.
              </Text>
            </View>
          </View>
          <Pressable
            className={`items-center rounded-lg bg-surface-container-lowest py-stack-md ${
              count === 0 ? 'opacity-50' : ''
            }`}>
            <Text className="font-mono-medium text-label-md text-primary">
              MARCAR COMO COMPRADO ({count})
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
