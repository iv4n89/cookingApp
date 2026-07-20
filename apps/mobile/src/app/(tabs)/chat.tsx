import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const REASONING = [
  'Analizando grasa: leche de coco (17-24%) vs. nata (36%) + leche entera (3,5%).',
  'Solución: una proporción 2:1 de leche y nata imita la viscosidad de la leche de coco entera.',
  'Sabor: refuerza con más jengibre y un toque de lima para compensar las notas florales del coco.',
];

const ADJUSTED = [
  { name: '1 taza de leche entera + ½ de nata', done: true },
  { name: '1,5 cdtas de jengibre fresco', done: true },
  { name: '2 cdas de pasta de curry rojo', done: false },
];

function UserMessage({ text }: { text: string }) {
  return (
    <View className="items-end gap-stack-sm">
      <Text className="font-mono uppercase text-label-sm text-on-surface-variant">Tú</Text>
      <View className="max-w-[85%] rounded-xl rounded-tr-none border border-primary bg-primary px-stack-lg py-gutter">
        <Text className="font-sans text-body-lg text-on-primary">{text}</Text>
      </View>
    </View>
  );
}

function ReasoningPanel() {
  return (
    <View className="w-full max-w-[92%] rounded-r-xl border-l-2 border-primary bg-surface-container-low px-stack-lg py-gutter">
      <View className="mb-stack-md flex-row items-center gap-stack-sm">
        <MaterialIcons name="psychology" size={18} color={colors.primary} />
        <Text className="font-mono-medium text-label-sm text-primary">ADAPTANDO LA RECETA</Text>
      </View>
      <View className="gap-stack-md">
        {REASONING.map((line) => (
          <View key={line} className="flex-row items-start gap-stack-md">
            <View className="mt-2 h-1.5 w-1.5 rounded-full bg-outline" />
            <Text className="flex-1 font-sans text-body-md italic text-on-surface-variant">{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AdjustedIngredient({ name, done }: { name: string; done: boolean }) {
  return (
    <View className={`flex-row items-center gap-stack-md ${done ? '' : 'opacity-60'}`}>
      <MaterialIcons
        name={done ? 'check-box' : 'check-box-outline-blank'}
        size={18}
        color={done ? colors.primary : colors['on-surface-variant']}
      />
      <Text className="flex-1 font-sans text-body-md text-on-surface">{name}</Text>
    </View>
  );
}

function ResponseCard() {
  return (
    <View className="w-full max-w-[96%] overflow-hidden rounded-xl rounded-tl-none border border-outline-variant bg-tertiary-fixed">
      <View className="gap-gutter p-stack-lg">
        <View className="flex-row items-start justify-between gap-stack-md">
          <View className="flex-1">
            <View className="mb-stack-sm self-start rounded-sm bg-primary px-stack-md py-stack-sm">
              <Text className="font-mono text-label-sm text-on-primary">RECETA ADAPTADA</Text>
            </View>
            <Text className="font-sans-semibold text-headline-md text-primary">
              Curry dorado cremoso con base láctea
            </Text>
          </View>
          <View className="flex-row items-center gap-stack-sm rounded-sm bg-tertiary px-stack-md py-stack-sm">
            <MaterialIcons name="timer" size={16} color={colors['on-tertiary']} />
            <Text className="font-mono text-label-sm text-on-tertiary">35 MIN</Text>
          </View>
        </View>

        <Text className="font-sans text-body-lg leading-relaxed text-tertiary">
          Sustituyendo por tu mezcla de leche y nata logramos un perfil más rico y algo más sabroso.
          Una alternativa excelente que resalta los aromas de tu pasta de curry.
        </Text>

        <View className="gap-stack-lg border-t border-outline-variant pt-gutter">
          <View>
            <Text className="mb-stack-md font-mono-medium text-label-md uppercase tracking-widest text-on-surface-variant">
              Ingredientes ajustados
            </Text>
            <View className="gap-stack-md">
              {ADJUSTED.map((item) => (
                <AdjustedIngredient key={item.name} name={item.name} done={item.done} />
              ))}
            </View>
          </View>

          <View className="rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
            <View className="mb-stack-md self-start bg-secondary-container px-stack-md py-stack-sm">
              <Text className="font-mono text-label-sm uppercase text-on-secondary-fixed-variant">
                Maridaje sensorial IA
              </Text>
            </View>
            <Text className="font-sans text-body-md italic text-on-surface-variant">
              “Las grasas lácteas ligan mejor con el comino y el cilantro. Espera una profundidad más
              ‘terrosa’ e intensa que las versiones con coco.”
            </Text>
          </View>
        </View>
      </View>

      <Pressable className="flex-row items-center justify-between bg-primary px-stack-lg py-gutter">
        <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
          Empezar cocina guiada
        </Text>
        <MaterialIcons name="arrow-forward" size={22} color={colors['on-primary']} />
      </Pressable>
    </View>
  );
}

function AiMessage() {
  return (
    <View className="items-start gap-stack-md">
      <View className="flex-row items-center gap-stack-md">
        <View className="h-8 w-8 items-center justify-center rounded-sm border border-outline-variant bg-tertiary-fixed">
          <Text className="font-mono-medium text-label-sm text-tertiary">IA</Text>
        </View>
        <Text className="font-mono uppercase tracking-widest text-label-sm text-on-surface-variant">
          Agente inteligente
        </Text>
      </View>
      <ReasoningPanel />
      <ResponseCard />
    </View>
  );
}

function InputBar() {
  return (
    <View className="flex-row items-center gap-stack-sm border-t border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable hitSlop={8}>
        <MaterialIcons name="add-circle-outline" size={26} color={colors['on-surface-variant']} />
      </Pressable>
      <TextInput
        className="flex-1 rounded-full border border-outline-variant bg-surface-container-lowest px-gutter py-stack-md font-sans text-body-md text-on-surface"
        placeholder="Pregunta sobre ingredientes o técnicas…"
        placeholderTextColor={colors['on-surface-variant']}
      />
      <Pressable className="h-11 w-11 items-center justify-center rounded-full bg-primary">
        <MaterialIcons name="send" size={20} color={colors['on-primary']} />
      </Pressable>
    </View>
  );
}

export default function ChatScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pt-stack-lg pb-stack-lg gap-stack-lg">
        <UserMessage text="¿Qué puedo cocinar con lo que tengo? Me falta leche de coco para el curry, pero tengo leche entera y nata de sobra." />
        <AiMessage />
      </ScrollView>
      <InputBar />
    </SafeAreaView>
  );
}
