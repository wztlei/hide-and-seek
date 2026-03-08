import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 items-center justify-center">
        <Text className="text-xl font-bold text-gray-800">Jet Lag: Hide and Seek</Text>
        <Text className="mt-2 text-sm text-gray-500">Map loading soon...</Text>
      </View>
    </SafeAreaView>
  );
}
