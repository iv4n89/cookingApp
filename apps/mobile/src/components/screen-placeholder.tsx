import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-background px-container-padding">
      <Text className="mb-stack-md font-sans-bold text-headline-md text-on-surface">{title}</Text>
      <Text className="font-mono text-label-md text-on-surface-variant">PRÓXIMAMENTE</Text>
    </SafeAreaView>
  );
}
