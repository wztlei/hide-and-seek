import '../global.css';
import '../lib/storage';

import { Stack } from 'expo-router';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';

// Suppress deprecation warning emitted by expo-router's own internal code
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

export default function RootLayout() {
  // expo-router's ExpoRoot already wraps everything in SafeAreaProvider.
  // Adding our own causes NativeWind's css-interop Babel shim to apply to it
  // (user code is transformed; node_modules is not), which injects CSS variable
  // strings as props onto react-native-screens' Fabric Stack → JSI TypeError.
  return (
    <>
      <Stack />
      <Toast />
    </>
  );
}
