/**
 * Configure @nanostores/persistent to use AsyncStorage instead of localStorage.
 * Must be imported BEFORE any atoms from lib/context.ts are created.
 */
import { setPersistentEngine } from '@nanostores/persistent';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage does not support cross-tab storage events — use no-op event engine
setPersistentEngine(AsyncStorage, {
  addEventListener() {},
  removeEventListener() {},
});
