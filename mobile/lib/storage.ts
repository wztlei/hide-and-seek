/**
 * Configure @nanostores/persistent to use AsyncStorage instead of localStorage.
 * Must be imported BEFORE any atoms from lib/context.ts are created.
 *
 * Root cause: @nanostores/persistent uses bracket notation (engine[key] = value)
 * which works synchronously with localStorage but silently does nothing persistent
 * with AsyncStorage (it just sets a JS property that disappears on restart).
 *
 * Fix: a Proxy over an in-memory object that intercepts bracket writes and
 * forwards them to AsyncStorage.setItem, plus a storageReady promise that
 * pre-loads all AsyncStorage data into the mirror before first render so that
 * atom.restore() reads the correct persisted values.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setPersistentEngine } from '@nanostores/persistent';

// In-memory mirror of AsyncStorage — populated before first render.
const memStore: Record<string, string> = {};

const storageProxy = new Proxy(memStore, {
  set(_target, key: string, value: string) {
    memStore[key] = value;
    AsyncStorage.setItem(key, value).catch(console.error);
    return true;
  },
  deleteProperty(_target, key: string) {
    delete memStore[key];
    AsyncStorage.removeItem(key).catch(console.error);
    return true;
  },
});

// Resolves once all AsyncStorage keys are loaded into memStore.
// _layout.tsx awaits this before rendering so atoms read persisted values
// on their first subscription (onMount → restore()).
export const storageReady: Promise<void> = AsyncStorage.getAllKeys()
  .then((keys) => AsyncStorage.multiGet(keys as string[]))
  .then((pairs) => {
    for (const [key, value] of pairs) {
      if (value !== null) memStore[key] = value;
    }
  })
  .catch(console.error)
  .then(() => undefined);

setPersistentEngine(storageProxy, {
  addEventListener() {},
  removeEventListener() {},
});
