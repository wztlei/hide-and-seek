import { useStore } from "@nanostores/react";
import { useCallback } from "react";
import Toast from "react-native-toast-message";

import { thunderforestApiKey, thunderforestEnabled, thunderforestTileUsage } from "../lib/context";

/** Tiles per month we allow users of the built-in shared key to consume. */
const TILE_LIMIT = 150;
/** Rough tile count loaded per camera gesture (typical viewport at zoom ~10–13). */
const TILES_PER_GESTURE = 9;
/** The key baked in at build time via EXPO_PUBLIC_THUNDERFOREST_API_KEY. */
const BUILTIN_KEY = process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY ?? "";

function getMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Manages the per-user monthly tile budget for the shared Thunderforest key.
 *
 * - Returns `overLimit=true` when the user has consumed ≥ TILE_LIMIT tiles
 *   this month using the built-in key (their own key is unlimited).
 * - `handleCameraChanged` should be passed to MLMapView's `onCameraChanged`;
 *   it increments the counter once per completed user gesture.
 * - Shows a one-time Toast when the limit is first crossed.
 * - Usage is persisted in AsyncStorage and resets automatically each month.
 */
export function useThunderforestBudget() {
    const $key = useStore(thunderforestApiKey);
    const $usage = useStore(thunderforestTileUsage);
    const $enabled = useStore(thunderforestEnabled);

    const usingBuiltinKey = !!BUILTIN_KEY && $key === BUILTIN_KEY;
    const month = getMonth();
    const effectiveCount = $usage.month === month ? $usage.count : 0;
    const overLimit = usingBuiltinKey && effectiveCount >= TILE_LIMIT;

    // Only count tiles when the Thunderforest layer is actually being rendered.
    const thunderforestActive = $enabled && usingBuiltinKey && !overLimit;

    const increment = useCallback(() => {
        if (!thunderforestActive) return;
        const m = getMonth();
        const current = thunderforestTileUsage.get();
        const prevCount = current.month === m ? current.count : 0;
        const newCount = prevCount + TILES_PER_GESTURE;
        thunderforestTileUsage.set({ count: newCount, month: m });

        // Fire toast exactly once when limit is crossed.
        if (prevCount < TILE_LIMIT && newCount >= TILE_LIMIT) {
            Toast.show({
                type: "info",
                text1: "Monthly map tile limit reached",
                text2: "Add your own Thunderforest key in Settings for transport maps.",
                visibilityTime: 7000,
            });
        }
    }, [thunderforestActive]);

    /**
     * Pass to MLMapView's `onRegionDidChange`. Fires once after each camera
     * movement (pan, zoom, rotate) and increments the tile usage counter.
     */
    const handleRegionDidChange = useCallback(() => {
        increment();
    }, [increment]);

    return { overLimit, handleRegionDidChange };
}
