import AsyncStorage from "@react-native-async-storage/async-storage";
import * as turf from "@turf/turf";
import type { FeatureCollection, Point } from "geojson";

import { LOCATION_FIRST_TAG, OVERPASS_API } from "../../src/maps/api/constants";
import type { TraditionalTentacleQuestion } from "../../src/maps/schema";

/** In-memory cache — survives re-renders, cleared on app restart. */
const memCache = new Map<string, FeatureCollection<Point>>();

function storageKey(url: string): string {
    return `tentacles-pois::${url}`;
}

function buildOverpassUrl(
    question: Pick<TraditionalTentacleQuestion, "lat" | "lng" | "radius" | "unit" | "locationType">,
): string {
    const radiusMeters = turf.convertLength(question.radius, question.unit, "meters");
    const tag = LOCATION_FIRST_TAG[question.locationType];
    const query = `[out:json][timeout:25];nwr["${tag}"="${question.locationType}"](around:${radiusMeters},${question.lat},${question.lng});out center;`;
    return `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
}

function parseElements(elements: any[]): FeatureCollection<Point> {
    const fc = turf.featureCollection([]) as FeatureCollection<Point>;
    for (const el of elements) {
        const name = el.tags?.["name:en"] ?? el.tags?.["name"];
        if (!name) continue;
        if (fc.features.find((f: any) => f.properties.name === name)) continue;
        const coord =
            el.lat != null
                ? [el.lon, el.lat]
                : el.center
                  ? [el.center.lon, el.center.lat]
                  : null;
        if (coord) fc.features.push(turf.point(coord, { name }));
    }
    return fc;
}

/**
 * Fetch nearby POIs for a tentacles question.
 *
 * Cache hierarchy (fastest → slowest):
 *   1. In-memory Map — survives re-renders, cleared on restart
 *   2. AsyncStorage — survives app restarts (data visible immediately on next open)
 *   3. Overpass API  — network fetch when both caches miss
 *
 * Pass `{ force: true }` to bypass both caches and re-fetch from the network.
 * The fresh result is written back to both caches.
 */
export async function fetchTentacleLocations(
    question: Pick<TraditionalTentacleQuestion, "lat" | "lng" | "radius" | "unit" | "locationType">,
    options?: { force?: boolean },
): Promise<FeatureCollection<Point>> {
    const url = buildOverpassUrl(question);
    const key = storageKey(url);

    if (!options?.force) {
        // 1. In-memory
        if (memCache.has(url)) return memCache.get(url)!;

        // 2. AsyncStorage
        try {
            const stored = await AsyncStorage.getItem(key);
            if (stored !== null) {
                const fc = JSON.parse(stored) as FeatureCollection<Point>;
                memCache.set(url, fc);
                return fc;
            }
        } catch {
            // Ignore storage read errors — fall through to network.
        }
    }

    // 3. Network
    const res = await fetch(url);
    const data = await res.json();
    const allPts = parseElements(data.elements);

    // Keep only POIs that fall within the radius circle.
    const radiusMeters = turf.convertLength(question.radius, question.unit, "meters");
    const circle = turf.circle([question.lng, question.lat], radiusMeters, { units: "meters", steps: 64 });
    const fc = turf.featureCollection(
        allPts.features.filter((pt) => turf.booleanPointInPolygon(pt, circle)),
    ) as FeatureCollection<Point>;

    memCache.set(url, fc);
    AsyncStorage.setItem(key, JSON.stringify(fc)).catch(() => {});

    return fc;
}
