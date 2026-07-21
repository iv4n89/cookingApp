import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function formatTime(totalSeconds: number) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

// Countdown timer for a step: play/pause, counts down to zero and then shows "LISTO".
export function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const done = remaining === 0;
  const icon = done ? 'check' : running ? 'pause' : 'play-arrow';

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
        accessibilityRole="button"
        accessibilityLabel={running ? 'Pausar temporizador' : 'Iniciar temporizador'}
        className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest">
        <MaterialIcons name={icon} size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
}
