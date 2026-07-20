import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Checkbox } from '@/components/checkbox';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

type Row =
  | { kind: 'item'; id: string; name: string; detail: string; qty: number; lowStock?: boolean }
  | { kind: 'stocked'; id: string; name: string; detail: string }
  | { kind: 'restock'; id: string; name: string; detail: string }
  | { kind: 'suggestion'; id: string; title: string; text: string };

interface Category {
  id: string;
  icon: IconName;
  name: string;
  count: string;
  rows: Row[];
}

const CATEGORIES: Category[] = [
  {
    id: 'verduras',
    icon: 'eco',
    name: 'Verduras',
    count: '12',
    rows: [
      { kind: 'item', id: 'spinach', name: 'Espinacas baby ecológicas', detail: '250 g • Cad: 3 días', qty: 1, lowStock: true },
      { kind: 'item', id: 'cherry', name: 'Tomates cherry', detail: '2 paquetes • De la huerta', qty: 2 },
      { kind: 'item', id: 'pepper', name: 'Pimientos rojos', detail: '3 unidades • Frescos', qty: 3 },
    ],
  },
  {
    id: 'proteinas',
    icon: 'set-meal',
    name: 'Proteínas',
    count: '5',
    rows: [
      { kind: 'item', id: 'salmon', name: 'Salmón atlántico', detail: '2 filetes • Congelado', qty: 2 },
      { kind: 'restock', id: 'chicken', name: 'Pechuga de pollo', detail: '0 g • Reponer' },
      { kind: 'item', id: 'eggs', name: 'Huevos morenos L', detail: '6 unidades • Ecológicos', qty: 6, lowStock: true },
    ],
  },
  {
    id: 'especias',
    icon: 'grain',
    name: 'Especias y cereales',
    count: '24',
    rows: [
      { kind: 'stocked', id: 'salt', name: 'Sal Maldon', detail: 'Caja llena • Despensa' },
      { kind: 'item', id: 'rice', name: 'Arroz basmati', detail: '1,5 kg • Grano largo', qty: 1 },
      { kind: 'suggestion', id: 'paprika', title: 'Sugerencia', text: 'Añade pimentón ahumado para el salmón' },
    ],
  },
];

function Stepper({ value }: { value: number }) {
  const [qty, setQty] = useState(value);
  return (
    <View className="flex-row items-center gap-stack-md">
      <Pressable
        onPress={() => setQty((q) => Math.max(0, q - 1))}
        className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant">
        <MaterialIcons name="remove" size={16} color={colors['on-surface']} />
      </Pressable>
      <Text className="w-4 text-center font-mono-medium text-label-md text-on-surface">{qty}</Text>
      <Pressable
        onPress={() => setQty((q) => q + 1)}
        className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant">
        <MaterialIcons name="add" size={16} color={colors['on-surface']} />
      </Pressable>
    </View>
  );
}

function LowStockBadge() {
  return (
    <View className="rounded bg-error-container px-stack-md py-stack-sm">
      <Text className="font-mono-medium text-[10px] uppercase tracking-widest text-on-error-container">
        STOCK BAJO
      </Text>
    </View>
  );
}

function ItemRow({ row }: { row: Extract<Row, { kind: 'item' }> }) {
  const [checked, setChecked] = useState(true);
  return (
    <View
      className={`flex-row items-center justify-between border border-card-border bg-card p-gutter ${
        checked ? '' : 'opacity-40'
      }`}>
      <View className="flex-1 flex-row items-center gap-gutter">
        <Checkbox checked={checked} onToggle={() => setChecked((c) => !c)} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-body-md text-primary">{row.name}</Text>
          <Text className="font-mono text-label-sm text-on-surface-variant">{row.detail}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-stack-md">
        {row.lowStock ? <LowStockBadge /> : null}
        <Stepper value={row.qty} />
      </View>
    </View>
  );
}

function StockedRow({ row }: { row: Extract<Row, { kind: 'stocked' }> }) {
  const [checked, setChecked] = useState(true);
  return (
    <View className="flex-row items-center justify-between border border-card-border bg-card p-gutter">
      <View className="flex-1 flex-row items-center gap-gutter">
        <Checkbox checked={checked} onToggle={() => setChecked((c) => !c)} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-body-md text-primary">{row.name}</Text>
          <Text className="font-mono text-label-sm text-on-surface-variant">{row.detail}</Text>
        </View>
      </View>
      <Text className="font-mono text-label-sm uppercase tracking-widest text-outline-variant">
        EN STOCK
      </Text>
    </View>
  );
}

function RestockRow({ row }: { row: Extract<Row, { kind: 'restock' }> }) {
  return (
    <View className="flex-row items-center justify-between border border-card-border bg-card p-gutter opacity-60">
      <View className="flex-1 flex-row items-center gap-gutter">
        <Checkbox checked={false} onToggle={() => {}} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-body-md text-on-surface-variant line-through">
            {row.name}
          </Text>
          <Text className="font-mono text-label-sm text-on-surface-variant">{row.detail}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-stack-sm rounded bg-tertiary px-stack-md py-stack-sm">
        <MaterialIcons name="shopping-cart" size={12} color={colors['on-tertiary']} />
        <Text className="font-mono-medium text-[10px] text-on-tertiary">AUTO</Text>
      </View>
    </View>
  );
}

function SuggestionRow({ row }: { row: Extract<Row, { kind: 'suggestion' }> }) {
  return (
    <View className="flex-row items-center justify-between border border-dashed border-primary/30 bg-primary-fixed/30 p-gutter">
      <View className="flex-1 flex-row items-center gap-gutter">
        <MaterialIcons name="auto-awesome" size={22} color={colors.primary} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-body-md text-primary">{row.title}</Text>
          <Text className="font-mono text-label-sm text-on-primary-fixed-variant">{row.text}</Text>
        </View>
      </View>
      <Pressable className="rounded bg-primary px-stack-md py-stack-sm">
        <Text className="font-mono-medium text-label-sm uppercase tracking-wider text-on-primary">
          Añadir
        </Text>
      </Pressable>
    </View>
  );
}

function renderRow(row: Row) {
  switch (row.kind) {
    case 'item':
      return <ItemRow key={row.id} row={row} />;
    case 'stocked':
      return <StockedRow key={row.id} row={row} />;
    case 'restock':
      return <RestockRow key={row.id} row={row} />;
    case 'suggestion':
      return <SuggestionRow key={row.id} row={row} />;
  }
}

function CategorySection({ category }: { category: Category }) {
  return (
    <View className="gap-stack-md">
      <View className="flex-row items-center justify-between border-b border-outline-variant pb-stack-md">
        <View className="flex-row items-center gap-stack-md">
          <MaterialIcons name={category.icon} size={22} color={colors.primary} />
          <Text className="font-sans-semibold text-headline-sm text-primary">{category.name}</Text>
        </View>
        <View className="rounded bg-surface-container px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm text-on-surface-variant">
            {category.count} ITEMS
          </Text>
        </View>
      </View>
      <View className="gap-stack-sm">{category.rows.map(renderRow)}</View>
    </View>
  );
}

function SegmentedFilter() {
  const [active, setActive] = useState(0);
  const options = ['TODO', 'STOCK BAJO'];
  return (
    <View className="flex-row self-start rounded-lg bg-tertiary-fixed p-1">
      {options.map((label, i) => (
        <Pressable
          key={label}
          onPress={() => setActive(i)}
          className={`rounded px-stack-lg py-stack-md ${active === i ? 'bg-primary' : ''}`}>
          <Text
            className={`font-mono-medium text-label-md ${
              active === i ? 'text-on-primary' : 'text-on-surface-variant'
            }`}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SearchField() {
  return (
    <View className="flex-row items-center gap-stack-md border-b-2 border-outline-variant py-stack-md">
      <MaterialIcons name="search" size={22} color={colors.outline} />
      <TextInput
        className="flex-1 font-sans-semibold text-headline-sm text-on-surface"
        placeholder="Buscar ingredientes (p. ej. aguacate, sal…)"
        placeholderTextColor={colors['outline-variant']}
      />
    </View>
  );
}

function StatsBento() {
  const bars = [
    { h: 'h-24', o: '' },
    { h: 'h-20', o: 'opacity-80' },
    { h: 'h-28', o: '' },
    { h: 'h-16', o: 'opacity-60' },
    { h: 'h-24', o: '' },
  ];
  return (
    <View className="gap-gutter">
      <View className="justify-between gap-stack-lg rounded-xl border border-card-border bg-card p-stack-lg">
        <View>
          <Text className="mb-stack-sm font-mono text-label-sm uppercase tracking-widest text-on-surface-variant">
            Salud de la alacena
          </Text>
          <Text className="font-sans-semibold text-headline-md text-primary">
            84% de básicos en stock
          </Text>
        </View>
        <View className="flex-row items-end gap-stack-sm">
          {bars.map((bar, i) => (
            <View key={i} className={`w-4 rounded-t-sm bg-primary ${bar.h} ${bar.o}`} />
          ))}
          <Text className="ml-stack-md flex-1 font-mono text-label-md text-on-surface-variant">
            Tendencia semanal
          </Text>
        </View>
      </View>

      <View className="items-center justify-center rounded-xl bg-tertiary p-stack-lg">
        <MaterialIcons name="notifications-active" size={32} color={colors['on-tertiary']} />
        <Text className="mt-stack-md font-sans-semibold text-headline-sm text-on-tertiary">
          3 productos caducan
        </Text>
        <Text className="mt-stack-sm font-mono text-label-sm text-on-tertiary opacity-80">
          Actúa en 48 h
        </Text>
      </View>

      <View className="gap-stack-lg rounded-xl bg-primary p-stack-lg">
        <Text className="font-mono text-label-sm uppercase tracking-widest text-on-primary opacity-80">
          IA Sous-Chef
        </Text>
        <Text className="font-sans-semibold text-headline-sm text-on-primary">
          ¿Generar un plan de comidas con tu stock actual?
        </Text>
        <Pressable className="flex-row items-center justify-between bg-surface-container-lowest px-gutter py-stack-md">
          <Text className="font-mono-medium text-label-md text-primary">INICIAR ANÁLISIS</Text>
          <MaterialIcons name="arrow-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function AlacenaScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-container-padding pb-section-gap pt-stack-lg gap-section-gap">
          <View className="gap-stack-lg">
            <View className="gap-stack-md">
              <Text className="font-sans-bold text-display-lg text-primary">Mi Alacena</Text>
              <Text className="font-sans text-body-lg text-on-surface-variant">
                Organiza tus ingredientes y controla el inventario con precisión. Tu sous-chef
                invisible sugiere recetas a partir de lo que tienes.
              </Text>
            </View>
            <SegmentedFilter />
            <SearchField />
          </View>

          <View className="gap-stack-lg">
            {CATEGORIES.map((category) => (
              <CategorySection key={category.id} category={category} />
            ))}
          </View>

          <StatsBento />
        </ScrollView>

        <Pressable className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary">
          <MaterialIcons name="add" size={28} color={colors['on-primary']} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
