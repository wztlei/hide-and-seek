/**
 * AsyncStorage-based cache replacing the browser Cache API.
 * Maintains the same 3-bucket strategy as src/maps/api/cache.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";

import { CacheType } from "../../src/maps/api/types";

function storageKey(cacheType: CacheType, url: string): string {
    return `${cacheType}::${url}`;
}

const inFlightFetches = new Map<string, Promise<string>>();

export const cacheFetch = async (
    url: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
): Promise<Response> => {
    const key = storageKey(cacheType, url);

    try {
        const cached = await AsyncStorage.getItem(key);
        if (cached !== null) {
            return new Response(cached, { status: 200 });
        }

        const inflightKey = `${cacheType}:${url}`;
        const existing = inFlightFetches.get(inflightKey);
        if (existing) {
            const text = await existing;
            return new Response(text, { status: 200 });
        }

        const fetchAndCache = async (): Promise<string> => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
            const text = await res.text();
            await AsyncStorage.setItem(key, text);
            return text;
        };

        const promise = fetchAndCache();
        inFlightFetches.set(inflightKey, promise);

        if (loadingText) {
            Toast.show({ type: "info", text1: loadingText });
        }

        try {
            const text = await promise;
            return new Response(text, { status: 200 });
        } finally {
            inFlightFetches.delete(inflightKey);
        }
    } catch (e) {
        console.warn("[cache] falling back to direct fetch:", e);
        return fetch(url);
    }
};

export const clearCache = async (
    cacheType: CacheType = CacheType.CACHE,
): Promise<void> => {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const prefix = `${cacheType}::`;
        const keysToRemove = allKeys.filter((k) => k.startsWith(prefix));
        if (keysToRemove.length > 0) {
            await AsyncStorage.multiRemove(keysToRemove);
        }
    } catch (e) {
        console.warn("[cache] clearCache error:", e);
    }
};
