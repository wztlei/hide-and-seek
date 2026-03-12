import * as Sentry from "@sentry/react-native";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Point } from "geojson";

import { LOCATION_FIRST_TAG, OVERPASS_API } from "../../src/maps/api/constants";
import type { TraditionalTentacleQuestion } from "../../src/maps/schema";
import { deleteCached, getCached, setCached } from "./storage";

// ── Tentacles persistent LRU cache ────────────────────────────────────────
//
// Entries stored under "tent:<locationType>:<lat>:<lng>:<radiusMeters>".
// Position rounded to 3 dp (~100 m) so small anchor adjustments still hit
// the cache. Radius rounded to the nearest metre.
// LRU list at "tent:__lru__", capped at TENT_CACHE_MAX entries.

const TENT_CACHE_MAX = 30;
const TENT_LRU_KEY = "tent:__lru__";

function tentStoreKey(
    question: Pick<
        TraditionalTentacleQuestion,
        "lat" | "lng" | "radius" | "unit" | "locationType"
    >,
): string {
    const radiusMeters = Math.round(
        turf.convertLength(question.radius, question.unit, "meters"),
    );
    return `tent:${question.locationType}:${question.lat.toFixed(3)}:${question.lng.toFixed(3)}:${radiusMeters}`;
}

function lruRead(): string[] {
    const raw = getCached(TENT_LRU_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
}

function lruTouch(list: string[], key: string): string[] {
    const idx = list.indexOf(key);
    if (idx !== -1) list.splice(idx, 1);
    list.push(key); // most-recently-used at the end
    return list;
}

function tentPersistentGet(key: string): Feature<Point>[] | null {
    const raw = getCached(key);
    if (!raw) return null;
    setCached(TENT_LRU_KEY, JSON.stringify(lruTouch(lruRead(), key)));
    return JSON.parse(raw) as Feature<Point>[];
}

function tentPersistentSet(key: string, features: Feature<Point>[]): void {
    setCached(key, JSON.stringify(features));
    const lru = lruTouch(lruRead(), key);
    while (lru.length > TENT_CACHE_MAX) {
        deleteCached(lru.shift()!);
    }
    setCached(TENT_LRU_KEY, JSON.stringify(lru));
}

// In-flight dedup — prevents duplicate concurrent Overpass requests within a session.
const tentInFlight = new Map<string, Promise<Feature<Point>[]>>();

function parseElements(elements: any[]): Feature<Point>[] {
    const seen = new Set<string>();
    const features: Feature<Point>[] = [];
    for (const el of elements) {
        const name = el.tags?.["name:en"] ?? el.tags?.["name"];
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const coord =
            el.lat != null
                ? [el.lon, el.lat]
                : el.center
                  ? [el.center.lon, el.center.lat]
                  : null;
        if (coord) features.push(turf.point(coord, { name }));
    }
    return features;
}

/**
 * Fetch nearby POIs for a tentacles question.
 *
 * Cache hierarchy (fastest → slowest):
 *   1. Persistent memStore (synchronous, survives restarts via AsyncStorage)
 *   2. In-flight dedup (prevents duplicate concurrent requests within a session)
 *   3. Overpass API (network fetch on full cache miss)
 *
 * The LRU cache is capped at TENT_CACHE_MAX entries; oldest entries are
 * evicted automatically when the cap is exceeded.
 */
export async function fetchTentacleLocations(
    question: Pick<
        TraditionalTentacleQuestion,
        "lat" | "lng" | "radius" | "unit" | "locationType"
    >,
): Promise<FeatureCollection<Point>> {
    const storeKey = tentStoreKey(question);

    // 1. Persistent cache — synchronous memStore lookup, no network needed.
    const persisted = tentPersistentGet(storeKey);
    if (persisted) {
        return turf.featureCollection(persisted) as FeatureCollection<Point>;
    }

    // 2. In-flight dedup — return existing promise for concurrent callers.
    const inflight = tentInFlight.get(storeKey);
    if (inflight) {
        return turf.featureCollection(
            await inflight,
        ) as FeatureCollection<Point>;
    }

    // 3. Fetch from Overpass, persist, return.
    const promise = (async (): Promise<Feature<Point>[]> => {
        const tag = LOCATION_FIRST_TAG[question.locationType];
        if (!tag) return [];
        const radiusMeters = Math.round(
            turf.convertLength(question.radius, question.unit, "meters"),
        );
        // Don't post-filter by circle: Overpass `around:` already handles radius
        // filtering via nearest boundary point. Large features (e.g. theme parks)
        // may have their centroid outside the radius even though they overlap it.
        const query = `[out:json][timeout:25];nwr["${tag}"="${question.locationType}"](around:${radiusMeters},${question.lat},${question.lng});out center;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Overpass tentacles ${question.locationType} ${res.status}`);
        const data = await res.json();
        const features = parseElements(data.elements);
        tentPersistentSet(storeKey, features);
        return features;
    })();

    tentInFlight.set(storeKey, promise);
    try {
        const features = await promise;
        return turf.featureCollection(features) as FeatureCollection<Point>;
    } finally {
        tentInFlight.delete(storeKey);
    }
}
