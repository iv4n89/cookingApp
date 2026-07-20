import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

type IconName = keyof typeof MaterialIcons.glyphMap;

const STEP1_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAFyzIdZ49kuEhibjip_CHdrP6ocRsPeHLCN2i5x4hfYS7Gq3XtCpfLjUgwLAzvwXqmsxF2WuzTrW6l8tfaezMY8DLqXOUtkyhw2r-sq-zciPvXnDiarbyDihxtBTRR3PO1OEXOnTL0QELYBryUVClg9oQGl45bVU2FcqRlTPeYLmZdyOBM1ushsZQ7MjkKdQsryIVM_7lhyOJMK2AgHMsH13WQUZngVmcW7v5NxFT8-bO7SQAk7HxTyi5kd78gXRJD7ikufpUy5Nce';
const STEP2_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCOvx6VkOsU6WWhVqpjBrpEBvn_GpIOYEn9a8aFzeLeo9YTpHZdVCn-ZU3Ttoy4PbnUn7U9nLHY5cgoEpOVipU4Llw4YofzYiJh9mxjy6FP2rF4fKcpfogx3dHUWIoRqew9g-BbRZum4ugZdA1PnUUiY1hWa2K4R1jM-ZP-xwXY_HlZM4CHAp-L5zrTBLFhK7qpBiMHZ8K-_0QFRp5UaEcLZv-ncMMPUrVsonbou51AHbaz86t-6hZYz6pHdxAnelKmBqHbBUs8kuRk';
const STEP3_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDGeUWVrV8STYlBHkzh42gYRHvLq6kVlgQALwitZQAhQARl4PK1YjG0x0_2yG5_yMDRjle6e_k_Cw0_WfyqW6lmFs76ENYR6hzin-d2LyviNZzSbtzzzFW0fBCw4XBJEjXxLsHNHE8QTb5fp3AIlAGMjBlQqM17GPH_g-X6UpLNhpr6XNJ_nXuBgEDOFxwN_5ENiWMXRc6XFw28JqxmD9AFpQIIbEnmEhm06tE0LSTDYsjnOEZsKpGytw5dtBaQDo22N3yLhDgFtfhm';

function formatTime(totalSeconds: number) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function TopBar() {
  return (
    <View className="flex-row items-center justify-between border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <View className="flex-1 flex-row items-center gap-gutter">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text className="font-sans-bold text-headline-sm text-primary">COCINA INTELIGENTE</Text>
      </View>
    </View>
  );
}

function NumberBadge({ status, n }: { status: 'done' | 'active' | 'upcoming'; n: number }) {
  const style =
    status === 'upcoming'
      ? 'bg-surface-container-highest border border-outline-variant'
      : 'bg-primary';
  return (
    <View
      className={`absolute -left-4 top-6 z-10 h-10 w-10 items-center justify-center rounded-full ${style}`}>
      {status === 'done' ? (
        <MaterialIcons name="check" size={20} color={colors['on-primary']} />
      ) : (
        <Text
          className={`font-sans-semibold text-headline-sm ${
            status === 'active' ? 'text-on-primary' : 'text-on-surface-variant'
          }`}>
          {n}
        </Text>
      )}
    </View>
  );
}

function StepChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View className="flex-row items-center gap-stack-sm rounded-full border border-card-border bg-card px-stack-md py-stack-sm">
      <MaterialIcons name={icon} size={16} color={colors.primary} />
      <Text className="font-mono-medium text-label-md text-primary">{label}</Text>
    </View>
  );
}

function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const done = remaining === 0;
  const icon: IconName = done ? 'check' : running ? 'pause' : 'play-arrow';

  return (
    <View className="flex-row items-center gap-gutter self-start rounded-xl bg-primary px-stack-lg py-gutter">
      <View>
        <Text className="font-mono uppercase tracking-widest text-label-sm text-on-primary-container">
          Temporizador
        </Text>
        <Text className="font-sans-bold text-display-lg leading-none text-on-primary">
          {done ? 'LISTO' : formatTime(remaining)}
        </Text>
      </View>
      <Pressable
        onPress={() => !done && setRunning((r) => !r)}
        className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest">
        <MaterialIcons name={icon} size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function CompletedStep() {
  return (
    <View className="relative rounded-xl border border-outline-variant bg-surface-container-low p-gutter opacity-60">
      <NumberBadge status="done" n={1} />
      <View className="ml-stack-lg gap-stack-md">
        <Image
          source={STEP1_IMAGE}
          style={{ width: '100%', height: 128, borderRadius: 8 }}
          contentFit="cover"
        />
        <View>
          <Text className="font-sans-semibold text-headline-md text-on-surface-variant opacity-20">
            01
          </Text>
          <Text className="font-sans-semibold text-headline-sm text-on-surface-variant line-through">
            Prepara la costra de hierbas
          </Text>
          <Text className="mt-stack-sm font-sans text-body-md text-on-surface-variant">
            Pica finamente perejil, tomillo y romero. Mezcla con pan rallado y ralladura de limón.
          </Text>
        </View>
      </View>
    </View>
  );
}

function ActiveStep() {
  return (
    <View className="relative rounded-xl border-2 border-primary bg-surface-container-lowest p-gutter">
      <NumberBadge status="active" n={2} />
      <View className="ml-stack-lg gap-stack-md">
        <Image
          source={STEP2_IMAGE}
          style={{ width: '100%', height: 192, borderRadius: 8 }}
          contentFit="cover"
        />
        <View className="flex-row items-start justify-between">
          <Text className="font-sans-semibold text-headline-md text-primary opacity-10">02</Text>
          <View className="rounded bg-secondary-container px-stack-md py-stack-sm">
            <Text className="font-mono text-label-sm text-secondary">PASO ACTUAL</Text>
          </View>
        </View>
        <Text className="font-sans-bold text-display-lg text-primary">Sella el filete</Text>
        <Text className="font-sans text-body-lg leading-relaxed text-on-surface">
          Calienta aceite de oliva en una sartén a fuego medio-alto. Coloca la lubina con la piel
          hacia abajo y séllala 4 minutos hasta que esté dorada y crujiente.
        </Text>

        <View className="mt-stack-md flex-row flex-wrap gap-stack-sm">
          <StepChip icon="set-meal" label="2 filetes de lubina" />
          <StepChip icon="water-drop" label="2 cdas de aceite" />
        </View>

        <View className="mt-stack-lg gap-gutter">
          <StepTimer seconds={240} />
          <Pressable className="flex-row items-center justify-center gap-stack-md rounded-xl border-[1.5px] border-primary px-stack-lg py-gutter">
            <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
            <Text className="font-mono-medium text-label-md text-primary">
              PEDIR SUSTITUTOS A LA IA
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function UpcomingStep({
  n,
  number,
  title,
  text,
  image,
  durationLabel,
}: {
  n: number;
  number: string;
  title: string;
  text: string;
  image?: string;
  durationLabel?: string;
}) {
  return (
    <View className="relative rounded-xl border border-outline-variant bg-surface-container-low p-gutter">
      <NumberBadge status="upcoming" n={n} />
      <View className="ml-stack-lg gap-stack-md">
        {image ? (
          <Image
            source={image}
            style={{ width: '100%', height: 128, borderRadius: 8 }}
            contentFit="cover"
          />
        ) : null}
        <View>
          <Text className="font-sans-semibold text-headline-md text-primary opacity-20">
            {number}
          </Text>
          <Text className="font-sans-semibold text-headline-sm text-primary">{title}</Text>
          <Text className="mt-stack-sm font-sans text-body-md text-on-surface-variant">{text}</Text>
          {durationLabel ? (
            <View className="mt-stack-md flex-row items-center gap-stack-md">
              <MaterialIcons name="timer" size={16} color={colors['on-surface-variant']} />
              <Text className="font-mono-medium text-label-md text-on-surface-variant">
                {durationLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function CookingModeScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <TopBar />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-section-gap">
        <View className="flex-row items-start justify-between gap-stack-md">
          <View className="flex-1">
            <Text className="font-sans-bold text-display-lg text-primary">
              Lubina con costra de hierbas
            </Text>
            <Text className="mt-stack-sm font-sans text-body-md text-on-surface-variant">
              Paso 2 de 4 • Tiempo restante: 18:00
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-stack-md self-start rounded-lg border border-outline-variant bg-surface-container-low px-gutter py-stack-md">
          <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
          <Text className="font-mono-medium text-label-md text-primary">IA SOUS-CHEF ACTIVA</Text>
        </View>

        <View className="gap-stack-lg pl-stack-md">
          <CompletedStep />
          <ActiveStep />
          <UpcomingStep
            n={3}
            number="03"
            title="Aplica la costra"
            text="Da la vuelta a los filetes y unta una capa fina de mostaza de Dijon. Presiona con firmeza la mezcla de hierbas sobre el pescado."
            image={STEP3_IMAGE}
          />
          <UpcomingStep
            n={4}
            number="04"
            title="Termina al horno"
            text="Pasa la sartén al horno precalentado a 200 °C. Hornea 8-10 minutos hasta que la costra esté dorada."
            durationLabel="10:00 de duración"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
