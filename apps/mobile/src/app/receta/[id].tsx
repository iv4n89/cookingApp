import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAI-hIZ5G7IwRE1SzBmcAmNIA-easet294yLYuWuNPzwqJ2lmmmUFjH-mIYS5kMCLA8RPFIk6vFRz_UOxvTVa1rE1pqlTbkAmIbrbtJM2dnuHR3BJxWsORT4E7jzz5bsYXrxMBXmNPG9veBLYVartMKlx1zjOOtNuAKDUPjiDvGe-Bw-NbKIVrVjMurIoM6smCIFYfV60N3LsmE5BcPrRB_LHaIsv5gubVWKAHveMRegzq4ZI084SU5Bxyntv9vwFg6dT2xYDCVw7m2';

const INGREDIENTS = [
  { name: 'Arroz arborio', inPantry: true },
  { name: 'Setas silvestres (rebozuelo)', inPantry: false },
  { name: 'Chalotas', inPantry: true },
  { name: 'Tomillo fresco', inPantry: false },
  { name: 'Caldo de verduras', inPantry: true },
  { name: 'Aceite de trufa', inPantry: false },
];

const STEPS = [
  {
    title: 'Prepara la base',
    text: 'Pica finamente las chalotas y sofríelas en una sartén de fondo grueso con un chorrito de aceite de oliva hasta que estén translúcidas y aromáticas.',
  },
  {
    title: 'Tuesta el grano',
    text: 'Añade el arroz arborio. Tuéstalo 2 minutos removiendo sin parar hasta que los bordes queden translúcidos y el centro siga blanco.',
  },
  {
    title: 'Integración lenta',
    text: 'Ve añadiendo caldo de verduras caliente cazo a cazo. Espera a que el líquido casi se absorba antes de añadir el siguiente.',
  },
  {
    title: 'Infusión de setas',
    text: 'A mitad del proceso, incorpora las setas salteadas y el tomillo fresco para que los sabores se fundan.',
  },
];

const MACROS = [
  { label: 'CALORÍAS', value: '420 KCAL' },
  { label: 'PROTEÍNA', value: '12 G' },
  { label: 'GRASAS', value: '18 G' },
  { label: 'CARBOS', value: '54 G' },
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

function Hero() {
  return (
    <View className="relative aspect-[3/2] w-full bg-surface-container">
      <Image source={HERO} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      <View className="absolute bottom-6 right-6 flex-row items-center gap-stack-md border border-outline-variant bg-secondary-container px-stack-md py-stack-sm">
        <Text className="font-mono text-label-sm text-on-secondary-container">FUENTE:</Text>
        <Text className="font-mono-medium text-label-sm text-on-secondary-container">
          GENERADO POR IA
        </Text>
      </View>
    </View>
  );
}

function MetaRow() {
  return (
    <View className="flex-row flex-wrap items-center gap-gutter">
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="schedule" size={18} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">45 MIN</Text>
      </View>
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="restaurant" size={18} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">2 RACIONES</Text>
      </View>
      <View className="flex-row items-center gap-stack-sm border border-outline-variant bg-tertiary-fixed px-stack-md py-stack-sm">
        <MaterialIcons name="bolt" size={16} color={colors.tertiary} />
        <Text className="font-mono text-label-sm uppercase text-tertiary">Encaja con tus macros</Text>
      </View>
    </View>
  );
}

function IngredientRow({ name, inPantry }: { name: string; inPantry: boolean }) {
  return (
    <View
      className={`flex-row items-center justify-between border border-outline-variant p-stack-md ${
        inPantry ? 'bg-surface' : 'bg-secondary-container'
      }`}>
      <View className="flex-1 flex-row items-center gap-stack-md">
        <View className={`h-2 w-2 rounded-full ${inPantry ? 'bg-primary' : 'bg-secondary'}`} />
        <Text className="flex-1 font-sans text-body-md text-on-surface">{name}</Text>
      </View>
      <Text
        className={`font-mono text-label-sm uppercase ${
          inPantry ? 'text-primary' : 'text-on-secondary-fixed-variant'
        }`}>
        {inPantry ? 'En la alacena' : 'Comprar'}
      </Text>
    </View>
  );
}

function StepItem({ index, title, text }: { index: number; title: string; text: string }) {
  const number = String(index + 1).padStart(2, '0');
  return (
    <View className="flex-row gap-gutter">
      <Text
        className="font-sans-semibold text-primary opacity-[0.15]"
        style={{ fontSize: 40, lineHeight: 40 }}>
        {number}
      </Text>
      <View className="flex-1">
        <Text className="mb-stack-sm font-sans-semibold text-headline-sm text-primary">{title}</Text>
        <Text className="font-sans text-body-md leading-relaxed text-on-surface-variant">{text}</Text>
      </View>
    </View>
  );
}

function Ingredients() {
  return (
    <View>
      <View className="mb-stack-md flex-row items-center justify-between">
        <Text className="font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
          Ingredientes
        </Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">
          {INGREDIENTS.length} ITEMS
        </Text>
      </View>
      <View className="mb-stack-lg gap-stack-md">
        {INGREDIENTS.map((ingredient) => (
          <IngredientRow key={ingredient.name} {...ingredient} />
        ))}
      </View>
      <Pressable className="flex-row items-center justify-center gap-stack-md bg-primary py-gutter">
        <MaterialIcons name="add-shopping-cart" size={18} color={colors['on-primary']} />
        <Text className="font-mono-medium text-label-md text-on-primary">AÑADIR LO QUE FALTA</Text>
      </Pressable>
    </View>
  );
}

function Preparation() {
  return (
    <View>
      <Text className="mb-stack-md font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
        Preparación
      </Text>
      <View className="gap-section-gap">
        {STEPS.map((step, i) => (
          <StepItem key={step.title} index={i} title={step.title} text={step.text} />
        ))}
      </View>
    </View>
  );
}

function MacrosGrid() {
  return (
    <View className="flex-row flex-wrap gap-gutter border-t border-outline-variant pt-stack-lg">
      {MACROS.map((macro) => (
        <View
          key={macro.label}
          className="flex-1 basis-[45%] items-center border border-outline-variant bg-surface p-gutter">
          <Text className="mb-stack-sm font-mono text-label-sm text-on-surface-variant">
            {macro.label}
          </Text>
          <Text className="font-sans-semibold text-headline-sm text-primary">{macro.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <TopBar />
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="pb-40">
          <Hero />
          <View className="-mt-8 px-container-padding">
            <View className="gap-section-gap border border-outline-variant bg-surface-container-lowest p-stack-lg">
              <View className="gap-stack-md border-b border-outline-variant pb-stack-lg">
                <Text className="font-sans-bold text-display-lg text-primary">
                  Risotto de setas silvestres y esencia de trufa
                </Text>
                <MetaRow />
              </View>

              <Text className="font-sans text-body-lg leading-relaxed text-on-surface-variant">
                Un risotto terroso y sofisticado que resalta el umami de las setas silvestres de
                temporada. Se termina con un toque de esencia de trufa para una experiencia de alta
                cocina en tu propia casa.
              </Text>

              <Ingredients />
              <Preparation />
              <MacrosGrid />
            </View>
          </View>
        </ScrollView>

        <View className="absolute bottom-8 right-container-padding">
          <Pressable
            onPress={() => router.push({ pathname: '/cocinar/[id]', params: { id } })}
            className="flex-row items-center gap-stack-md bg-primary px-stack-lg py-gutter">
            <MaterialIcons name="play-arrow" size={22} color={colors['on-primary']} />
            <Text className="font-mono-medium text-label-md tracking-widest text-on-primary">
              EMPEZAR A COCINAR
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
