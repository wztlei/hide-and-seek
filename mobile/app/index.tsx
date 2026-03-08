import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View as RNView } from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';

import { AppMapView } from '../components/MapView';
import { SettingsModal } from '../components/SettingsModal';

const SafeAreaView = RNSafeAreaView as any;
const View = RNView as any;

export default function HomeScreen() {
  const [settingsVisible, setSettingsVisible] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.mapContainer}>
        <AppMapView />
        <Pressable
          style={({ pressed }) => [styles.gearButton, pressed && styles.gearPressed]}
          onPress={() => setSettingsVisible(true)}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color="#333" />
        </Pressable>
      </View>
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapContainer: {
    flex: 1,
  },
  gearButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  gearPressed: {
    opacity: 0.7,
  },
});
