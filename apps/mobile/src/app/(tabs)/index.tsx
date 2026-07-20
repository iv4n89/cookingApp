import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const RECIPES: RecipeCardData[] = [
  {
    id: 'pomodoro',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCAVyLK9Dd5j09EROC0O4SeI5uZiW4IBv56gTAjNtBMV-OWGeY4AZ5oEUHm12_OvSCqgspY7M7miqxqhM6YndOKVE6aHC_L2V_rRT2eQqDCy3A4teLa3M2mSJ2u7K_NT_oxrD8niZJCaXjvatQ4dX79pPgMMUXmbgqfCPqs_9KEqSWYTeJO15Hr_bXGxwWGp4at9GNKkrSCt6uBj9wxLhjZHROJuOgDYjQcFApCvajXFiC5x5bCCGLIPEepZFaQkv1FKkmdZB1UFpLW',
    badgeIcon: 'auto-awesome',
    badge: 'MARIDAJE SENSORIAL',
    title: 'Pomodoro rústico',
    description: 'Aprovecha tus tomates y albahaca fresca. 15 min de preparación.',
    tags: ['VEGETARIANO', '15 MIN'],
  },
  {
    id: 'salmon',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAOXXPV2SzKSOTYnnlG36-pDYFa9q2t69xQh4U12sQSnlqq0vxIDWv5Gv1wRIlZ7818H9sHutnchTPR_Uk0XARZLgtQht_59co3I-TuXaN-RExi2WR0BlxIpfWweOT2XLt8csNArgJ5x_iU5ftwc5lwsSeIvspbmcioFp6rccHMu4GSdoTwqFysqT9oekiCj-86S9EvHFDYLwu-IB9WVQldyiWy36jkBTBHmeJoeTaQujIjanW76oyQ6qvoPvM_m3K29wJG2aLuDQT-',
    badgeIcon: 'bolt',
    badge: 'ENCAJA CON TUS MACROS',
    title: 'Salmón atlántico al limón',
    description: 'Opción alta en proteína con el salmón de tu congelador. Rico en Omega-3.',
    tags: ['ALTA PROTEÍNA', '25 MIN'],
  },
  {
    id: 'kale',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCd9dEc5TuSyiUI-wFVvSnzY0Gd94BWpLnCHqAUIew7YUPXGVQPed7KTbYqRVWotWwYu0u_0Feo04OWxTItWX8m1vk4koVdTKqTWDV25a3ahmA3sJzi55nwqXln5JaoavY0__wwtAS_Ldn_WxYco8Dm4uv_vWjz2pX65exZ1tDKo9m5X9E-HbjaUriTBSE6Blb-ffkCKNQObVxYdjE8gUH0fmssgL6D5GbwIClaWFad7MRxbksz9EJqxBCVgy3BmbRGBBm3nWKu24tA',
    badgeIcon: 'eco',
    badge: 'CERO DESPERDICIO',
    title: 'Bowl de col y cereales',
    description: 'Pensada para gastar tu col antes de que caduque. Alta en fibra.',
    tags: ['SALUDABLE', '20 MIN'],
  },
];

function SearchBar() {
  return (
    <View className="relative justify-center">
      <View className="absolute left-4 z-10">
        <MaterialIcons name="chat-bubble-outline" size={22} color={colors.primary} />
      </View>
      <TextInput
        className="h-16 border-b-2 border-outline bg-surface-container-lowest pl-14 pr-28 font-sans text-body-lg text-on-surface"
        placeholder="Pregunta a la IA: ¿qué hago con la col y el bacon que me sobran?"
        placeholderTextColor={colors['on-surface-variant']}
        multiline={false}
      />
      <Pressable className="absolute right-4 flex-row items-center gap-stack-sm bg-primary px-stack-lg py-stack-md">
        <Text className="font-mono-medium text-label-md text-on-primary">PREGUNTAR</Text>
        <MaterialIcons name="arrow-forward" size={16} color={colors['on-primary']} />
      </Pressable>
    </View>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View className="mb-stack-lg flex-row items-center justify-between">
      <Text className="font-sans-semibold text-headline-md text-on-surface">{title}</Text>
      <Pressable className="flex-row items-center gap-stack-sm">
        <Text className="font-mono-medium text-label-md text-primary">{action}</Text>
        <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function CriticalStockCard() {
  const items = [
    { name: 'Yogur griego', left: '150 g' },
    { name: 'Tomate San Marzano', left: '1 lata' },
  ];
  return (
    <View className="rounded-xl border border-card-border bg-card p-stack-lg">
      <View className="mb-stack-md self-start bg-primary-container px-stack-md py-stack-sm">
        <Text className="font-mono-medium text-label-sm text-on-primary-container">STOCK CRÍTICO</Text>
      </View>
      <Text className="mb-stack-md font-sans-semibold text-headline-sm text-on-surface">
        Se acaban básicos
      </Text>
      <View className="gap-stack-md">
        {items.map((item) => (
          <View key={item.name} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-stack-md">
              <View className="h-2 w-2 rounded-full bg-error" />
              <Text className="font-sans text-body-md text-on-surface">{item.name}</Text>
            </View>
            <Text className="font-sans text-body-md text-on-surface-variant">{item.left}</Text>
          </View>
        ))}
      </View>
      <Pressable className="mt-stack-lg items-center border-[1.5px] border-primary py-stack-md">
        <Text className="font-mono-medium text-label-md text-primary">AÑADIR A LA COMPRA</Text>
      </Pressable>
    </View>
  );
}

function ExpiringCard() {
  return (
    <View className="rounded-xl border border-card-border bg-card p-stack-lg">
      <MaterialIcons name="timer" size={28} color={colors.secondary} />
      <Text className="mb-stack-sm mt-stack-md font-sans-semibold text-headline-sm text-on-surface">
        Caduca pronto
      </Text>
      <Text className="mb-stack-lg font-sans text-body-md text-on-surface-variant">
        Usa las espinacas frescas en 48 h para el mejor sabor.
      </Text>
      <View className="self-start bg-tertiary-fixed px-stack-md py-stack-sm">
        <Text className="font-mono-medium text-label-sm text-on-tertiary-fixed">EN 3 RECETAS</Text>
      </View>
    </View>
  );
}

function QuickAddCard() {
  return (
    <View className="items-center justify-center rounded-xl border-2 border-dashed border-card-border bg-card p-stack-lg">
      <MaterialIcons name="add-circle-outline" size={36} color={colors.outline} />
      <Text className="mt-stack-md text-center font-mono-medium text-label-md text-on-surface-variant">
        Escanear ticket o{'\n'}añadir a mano
      </Text>
    </View>
  );
}

export default function InicioScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pb-section-gap pt-stack-lg gap-section-gap">
        <View className="gap-stack-md">
          <Text className="font-mono-medium text-label-md uppercase tracking-widest text-secondary">
            Buenos días, chef
          </Text>
          <Text className="font-sans-bold text-display-lg text-on-surface">¿Qué cocinamos hoy?</Text>
          <Pressable
            onPress={() => router.push('/premium')}
            className="mt-stack-sm flex-row items-center gap-stack-md self-start rounded-lg border border-outline-variant bg-secondary-container px-stack-md py-stack-sm">
            <MaterialIcons name="workspace-premium" size={18} color={colors['on-secondary-container']} />
            <Text className="font-mono-medium text-label-sm text-on-secondary-container">
              PLAN PREMIUM • 2,99 €/MES
            </Text>
          </Pressable>
        </View>

        <SearchBar />

        <View>
          <SectionHeader title="Tu alacena" action="VER TODO" />
          <View className="gap-gutter">
            <CriticalStockCard />
            <ExpiringCard />
            <QuickAddCard />
          </View>
        </View>

        <View>
          <SectionHeader title="Para tu alacena" action="VER MÁS" />
          <View className="gap-gutter">
            {RECIPES.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
