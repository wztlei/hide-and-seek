/**
 * Configure @nanostores/persistent to use AsyncStorage instead of localStorage.
 * Must be imported BEFORE any atoms from lib/context.ts are created.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setPersistentEngine } from '@nanostores/persistent';

setPersistentEngine(AsyncStorage, {
  // AsyncStorage does not support cross-tab storage events
  listen: false,
});
