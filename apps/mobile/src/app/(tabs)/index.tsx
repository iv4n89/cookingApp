import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { AskAiModal } from '@/components/ask-ai-modal';
import { HomeAskInput } from '@/features/home/components/home-ask-input';
import { HomeSectionHeader } from '@/features/home/components/home-section-header';
import { HomeSuggestions } from '@/features/home/components/home-suggestions';
import { PantrySummaryCard } from '@/features/home/components/pantry-summary-card';
import { QuickAddCard } from '@/features/home/components/quick-add-card';
import { useHome } from '@/features/home/hooks/use-home';

import { colors } from '@recetas/theme/tokens';

export default function InicioScreen() {
  const [askVisible, setAskVisible] = useState(false);
  const {
    suggestions,
    buySuggestions,
    loadingSuggestions,
    refreshing,
    refresh,
    meal,
    greetingText,
    pantry,
    addingLow,
    addedLow,
    saved,
    toggleSave,
    addLowToShopping,
  } = useHome();

  const openRecipe = (id: string) => router.push({ pathname: '/receta/[id]', params: { id } });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pb-section-gap pt-stack-lg gap-section-gap"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }>
        <View className="gap-stack-md">
          <Text className="font-mono-medium text-label-md uppercase tracking-widest text-secondary">
            {greetingText}, chef
          </Text>
          <Text className="font-sans-bold text-display-lg text-on-surface">¿Qué cocinamos hoy?</Text>
        </View>

        <HomeAskInput onPress={() => setAskVisible(true)} />

        <View>
          <HomeSectionHeader title="Tu despensa" action="VER TODO" onAction={() => router.push('/alacena')} />
          <View className="gap-gutter">
            {pantry ? (
              <PantrySummaryCard
                summary={pantry}
                onAddToShopping={addLowToShopping}
                adding={addingLow}
                added={addedLow}
              />
            ) : null}
            <QuickAddCard onPress={() => router.push('/alacena')} />
          </View>
        </View>

        <View>
          <HomeSectionHeader title={`Ideas para tu ${meal}`} />
          <HomeSuggestions
            loading={loadingSuggestions}
            suggestions={suggestions}
            saved={saved}
            onToggleSave={toggleSave}
            onOpen={openRecipe}
          />
        </View>

        {!loadingSuggestions && buySuggestions.length > 0 ? (
          <View>
            <HomeSectionHeader title="Para comprar algo más" />
            <HomeSuggestions
              loading={false}
              suggestions={buySuggestions}
              saved={saved}
              onToggleSave={toggleSave}
              onOpen={openRecipe}
            />
          </View>
        ) : null}
      </ScrollView>

      <AskAiModal
        visible={askVisible}
        onClose={() => setAskVisible(false)}
        onSubmit={(question) => router.push({ pathname: '/chat', params: { q: question, t: String(Date.now()) } })}
      />
    </SafeAreaView>
  );
}
