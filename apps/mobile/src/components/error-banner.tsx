import { Pressable, Text, View } from 'react-native';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-gutter rounded-lg bg-error-container px-gutter py-stack-md">
      <Text className="flex-1 font-sans text-body-md text-on-error-container">{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text className="font-mono-medium text-label-md text-on-error-container">Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
