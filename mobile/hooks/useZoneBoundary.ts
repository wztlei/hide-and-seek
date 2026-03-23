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
                mapGeoJSON.set(JSON.parse(cached));
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
        fetchAllZoneBoundaries()
            .then((boundary) => {
                if (cancelled) return;
                toast.success("Zone boundary loaded");
                // Defer the heavy nanostore update so the toast text gets a
                // paint cycle before the map re-render saturates the JS thread.
                requestAnimationFrame(() => {
                    if (cancelled) return;
                    mapGeoJSON.set(boundary);
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
