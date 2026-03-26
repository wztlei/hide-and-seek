import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";

import {
    additionalMapGeoLocations,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
} from "../lib/context";
import { fetchAllZoneBoundaries } from "../lib/fetchZoneBoundary";
import { toast } from "../lib/notifications";
import { getCached, setCached } from "../lib/storage";

const BOUNDARY_CACHE_KEY = "cachedMapGeoJSON";

/**
 * Manages zone boundary loading:
 *  1. Seeds mapGeoJSON from the MMKV cache on mount so the map renders
 *     immediately before the Overpass API call completes.
 *  2. Refetches whenever the selected location(s) change, then writes the
 *     result back to both the nanostore and the cache.
 *
 * Returns `isLoadingZone` for showing a spinner in the zone button.
 */
export function useZoneBoundary() {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);
    const $polyGeoJSON = useStore(polyGeoJSON);
    const [isLoadingZone, setIsLoadingZone] = useState(false);

    // Seed from cache on mount. storageReady has already resolved by the time
    // MapView mounts, so getCached is a synchronous memStore lookup.
    useEffect(() => {
        const cached = getCached(BOUNDARY_CACHE_KEY);
        if (cached) {
            try {
                const t0 = Date.now();
                const parsed = JSON.parse(cached);
                console.log(
                    `[useZoneBoundary] cache seed: parse=${Date.now() - t0}ms len=${cached.length}`,
                );
                mapGeoJSON.set(parsed);
            } catch (e) {
                console.error("Failed to parse cached boundary:", e);
            }
        }
    }, []);

    // Re-fetch whenever the selected location(s) or drawn polygon change.
    useEffect(() => {
        let cancelled = false;
        setIsLoadingZone(true);
        toast.loading("Loading zone boundary…");
        const tFetch = Date.now();
        fetchAllZoneBoundaries()
            .then((boundary) => {
                if (cancelled) return;
                console.log(
                    `[useZoneBoundary] fetchAllZoneBoundaries total: ${Date.now() - tFetch}ms`,
                );
                toast.success("Zone boundary loaded");
                // Defer the heavy nanostore update so the toast text gets a
                // paint cycle before the map re-render saturates the JS thread.
                const tSet = Date.now();
                requestAnimationFrame(() => {
                    if (cancelled) return;
                    mapGeoJSON.set(boundary);
                    console.log(
                        `[useZoneBoundary] mapGeoJSON.set + rAF: ${Date.now() - tSet}ms`,
                    );
                    setCached(BOUNDARY_CACHE_KEY, JSON.stringify(boundary));
                });
            })
            .catch((e) => {
                console.error("fetchAllZoneBoundaries failed:", e);
                toast.error("Could not load zone boundary");
            })
            .finally(() => {
                if (!cancelled) setIsLoadingZone(false);
            });
        return () => {
            cancelled = true;
        };
    }, [
        $polyGeoJSON,
        $mapGeoLocation.properties.osm_id,
        $additionalMapGeoLocations.length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        $additionalMapGeoLocations
            .map((x) => `${x.location.properties.osm_id}:${x.added}`)
            .join(","),
    ]);

    return { isLoadingZone };
}
