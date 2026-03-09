import '../global.css';

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';

import { toastConfig } from '../components/ToastConfig';
import { storageReady } from '../lib/storage';

// Suppress deprecation warning emitted by expo-router's own internal code
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  // Block rendering until AsyncStorage is fully loaded into the in-memory
  // mirror so that nanostores atoms read persisted values on first mount.
  useEffect(() => {
    storageReady.then(() => setReady(true));
  }, []);

  if (!ready) return null;

  // expo-router's ExpoRoot already wraps everything in SafeAreaProvider.
  // Adding our own causes NativeWind's css-interop Babel shim to apply to it
  // (user code is transformed; node_modules is not), which injects CSS variable
  // strings as props onto react-native-screens' Fabric Stack → JSI TypeError.
  return (
    <>
      <Stack />
      <Toast config={toastConfig} position="top" topOffset={60} />
    </>
  );
}
