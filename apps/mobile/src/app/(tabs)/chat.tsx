import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { useSession } from '@/lib/auth';
import { getPantryMatch, type PantryMatch } from '@/lib/pantry';
import { isMissing } from '@/lib/pantry-match';
import { sendChat, type ChatMessage } from '@/lib/chat';
import {
  addIngredientsToShopping,
  formatQuantity,
  scaleIngredients,
  type Recipe,
  type RecipeIngredient,
} from '@/lib/recipes';

const MAX_SERVINGS = 20;

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const SUGGESTIONS = [
  'Tengo mantequilla y patatas, dame una receta',
  '¿Qué puedo cocinar con lo que tengo?',
  'Algo rápido para cenar hoy',
];

function MetaChip({ icon, text }: { icon: 'schedule' | 'restaurant'; text: string }) {
  return (
    <View className="flex-row items-center gap-stack-sm">
      <MaterialIcons name={icon} size={16} color={colors['on-surface-variant']} />
      <Text className="font-mono-medium text-label-sm text-on-surface-variant">{text}</Text>
    </View>
  );
}

function ServingsStepper({ servings, onChange }: { servings: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
      <Text className="font-sans-semibold text-body-md text-on-surface">Raciones</Text>
      <View className="flex-row items-center gap-gutter">
        <Pressable
          onPress={() => onChange(Math.max(1, servings - 1))}
          disabled={servings <= 1}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Menos raciones"
          className={servings <= 1 ? 'opacity-40' : ''}>
          <MaterialIcons name="remove-circle-outline" size={26} color={colors.primary} />
        </Pressable>
        <Text className="w-8 text-center font-mono-medium text-headline-sm text-on-surface">{servings}</Text>
        <Pressable
          onPress={() => onChange(Math.min(MAX_SERVINGS, servings + 1))}
          disabled={servings >= MAX_SERVINGS}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Más raciones"
          className={servings >= MAX_SERVINGS ? 'opacity-40' : ''}>
          <MaterialIcons name="add-circle-outline" size={26} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function ingredientText(ingredient: RecipeIngredient): string {
  return [formatQuantity(ingredient.quantity), ingredient.unit, ingredient.name]
    .filter((v) => v !== '' && v !== null)
    .join(' ');
}

function RecipeCard({ recipe, pantry }: { recipe: Recipe; pantry: PantryMatch | null }) {
  const { session } = useSession();
  const [servings, setServings] = useState(recipe.servings > 0 ? recipe.servings : 1);
  const [addedMissing, setAddedMissing] = useState(false);
  const [addingMissing, setAddingMissing] = useState(false);
  const [addFailed, setAddFailed] = useState(false);

  const total = recipe.prep_time_min + recipe.cook_time_min;
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  const missing = pantry ? scaled.filter((ing) => isMissing(ing, pantry)) : [];

  async function addMissing() {
    if (!session || addingMissing || addedMissing || missing.length === 0) return;
    setAddingMissing(true);
    setAddFailed(false);
    try {
      await addIngredientsToShopping(session.user.id, missing);
      setAddedMissing(true);
    } catch {
      setAddFailed(true);
    } finally {
      setAddingMissing(false);
    }
  }

  return (
    <View className="w-full max-w-[92%] gap-gutter overflow-hidden rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low">
      <View className="aspect-[3/2] w-full items-center justify-center bg-surface-container">
        {recipe.image_url ? (
          <Image source={recipe.image_url} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <MaterialIcons name="restaurant-menu" size={36} color={colors['outline-variant']} />
        )}
      </View>

      <View className="gap-gutter p-stack-lg pt-0">
        <View className="self-start bg-primary px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm text-on-primary">RECETA</Text>
        </View>
        <Text className="font-sans-semibold text-headline-sm text-on-surface">{recipe.title}</Text>
        {recipe.description ? (
          <Text className="font-sans text-body-md text-on-surface-variant">{recipe.description}</Text>
        ) : null}
        {total > 0 ? (
          <View className="flex-row flex-wrap gap-gutter">
            <MetaChip icon="schedule" text={`${total} MIN`} />
          </View>
        ) : null}

        <ServingsStepper servings={servings} onChange={setServings} />

        <View className="gap-stack-md border-t border-outline-variant pt-gutter">
          <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
            Ingredientes
          </Text>
          {scaled.map((ing, i) => {
            const falta = pantry ? isMissing(ing, pantry) : false;
            return (
              <View key={i} className="flex-row items-start gap-stack-md">
                <View className={`mt-2 h-1.5 w-1.5 rounded-full ${falta ? 'bg-secondary' : 'bg-primary'}`} />
                <Text className="flex-1 font-sans text-body-md text-on-surface">{ingredientText(ing)}</Text>
                {falta ? (
                  <Text className="mt-0.5 font-mono text-label-sm uppercase text-secondary">Falta</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {missing.length > 0 ? (
          <Pressable
            onPress={addMissing}
            disabled={addingMissing || addedMissing}
            className={`flex-row items-center justify-center gap-stack-md border border-primary py-stack-md ${
              addingMissing || addedMissing ? 'opacity-60' : ''
            }`}>
            {addingMissing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <MaterialIcons name={addedMissing ? 'check' : 'add-shopping-cart'} size={18} color={colors.primary} />
            )}
            <Text className="font-mono-medium text-label-md text-primary">
              {addedMissing
                ? 'AÑADIDO A LA COMPRA'
                : addingMissing
                  ? 'AÑADIENDO…'
                  : `AÑADIR LO QUE FALTA (${missing.length})`}
            </Text>
          </Pressable>
        ) : null}
        {addFailed ? (
          <Text className="font-sans text-body-md text-error">No se pudo añadir. Inténtalo de nuevo.</Text>
        ) : null}

        <Pressable
          onPress={() => router.push({ pathname: '/receta/[id]', params: { id: recipe.id, servings } })}
          className="flex-row items-center justify-center gap-stack-md bg-primary py-gutter">
          <MaterialIcons name="play-arrow" size={20} color={colors['on-primary']} />
          <Text className="font-mono-medium uppercase tracking-widest text-label-md text-on-primary">
            Comenzar a cocinar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function MessageView({ message, pantry }: { message: ChatMessage; pantry: PantryMatch | null }) {
  const mine = message.role === 'user';
  return (
    <View className={mine ? 'items-end gap-stack-sm' : 'items-start gap-stack-md'}>
      <Text className="font-mono uppercase text-label-sm text-on-surface-variant">
        {mine ? 'Tú' : 'Asistente'}
      </Text>
      {message.content ? (
        <View
          className={`max-w-[88%] px-stack-lg py-gutter ${
            mine
              ? 'rounded-xl rounded-tr-none border border-primary bg-primary'
              : 'rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low'
          }`}>
          <Text className={`font-sans text-body-lg ${mine ? 'text-on-primary' : 'text-on-surface'}`}>
            {message.content}
          </Text>
        </View>
      ) : null}
      {message.recipe ? <RecipeCard recipe={message.recipe} pantry={pantry} /> : null}
    </View>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View className="mt-section-gap items-center gap-stack-lg px-container-padding">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-tertiary-fixed">
        <MaterialIcons name="auto-awesome" size={26} color={colors.primary} />
      </View>
      <Text className="text-center font-sans-semibold text-headline-sm text-on-surface">
        Pregúntame qué cocinar
      </Text>
      <Text className="text-center font-sans text-body-md text-on-surface-variant">
        Tengo en cuenta tus preferencias, tus necesidades y lo que hay en tu despensa.
      </Text>
      <View className="gap-stack-md">
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPick(s)}
            className="rounded-full border border-outline-variant bg-surface px-stack-lg py-stack-md">
            <Text className="font-sans text-body-md text-on-surface">{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pantry, setPantry] = useState<PantryMatch | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ q?: string }>();

  useEffect(() => {
    let active = true;
    getPantryMatch()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Envía una conversación (el historial ya con el último mensaje del usuario) y añade la
  // respuesta. Al sembrar desde el Home se pasa un historial de un solo mensaje (nueva conversación).
  async function runChat(history: ChatMessage[]) {
    setFailed(false);
    setMessages(history);
    setSending(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    try {
      const reply = await sendChat(history);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply.message, recipe: reply.recipe }]);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    runChat([...messages, { role: 'user', content }]);
  }

  // Pregunta llegada desde el Home: nueva conversación con ese texto como primer mensaje.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    const q = typeof params.q === 'string' ? params.q.trim() : '';
    if (q && seeded.current !== q) {
      seeded.current = q;
      runChat([{ role: 'user', content: q }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-stack-lg gap-stack-lg"
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <EmptyState onPick={send} />
          ) : (
            messages.map((m, i) => <MessageView key={i} message={m} pantry={pantry} />)
          )}
          {sending ? (
            <View className="items-start gap-stack-sm">
              <Text className="font-mono uppercase text-label-sm text-on-surface-variant">Asistente</Text>
              <View className="rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low px-stack-lg py-gutter">
                <ActivityIndicator color={colors.primary} />
              </View>
            </View>
          ) : null}
          {failed ? (
            <Text className="font-sans text-body-md text-error">
              No se pudo responder. Inténtalo de nuevo.
            </Text>
          ) : null}
        </ScrollView>

        <View className="flex-row items-end gap-stack-sm border-t border-outline-variant bg-background px-container-padding py-stack-md">
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!sending}
            multiline
            placeholder="Pregunta sobre recetas o ingredientes…"
            placeholderTextColor={colors['on-surface-variant']}
            style={{ minHeight: 44, maxHeight: 120, textAlignVertical: 'top' }}
            className="flex-1 rounded-2xl border border-outline-variant bg-surface-container-lowest px-gutter py-stack-md font-sans text-body-md text-on-surface"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${
              sending || !input.trim() ? 'opacity-50' : ''
            }`}>
            <MaterialIcons name="send" size={20} color={colors['on-primary']} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
