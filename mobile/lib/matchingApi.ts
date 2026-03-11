import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import osmtogeojson from "osmtogeojson";

import { LOCATION_FIRST_TAG, OVERPASS_API } from "../../src/maps/api/constants";
import { deleteCached, getCached, setCached } from "./storage";

// ── In-memory caches keyed on stringified params ───────────────────────────

const adminBoundaryCache = new Map<string, Promise<Feature<Polygon | MultiPolygon> | null>>();
const adminSubLevelsCache = new Map<string, Promise<AdminSubLevel[]>>();
const airportsCache: { promise: Promise<FeatureCollection<Point>> | null } = { promise: null };
const majorCitiesCache: { promise: Promise<FeatureCollection<Point>> | null } = { promise: null };

// ── POI persistent LRU cache ──────────────────────────────────────────────
//
// Entries are stored in AsyncStorage (via the memStore mirror in storage.ts)
// under keys "poi:<type>:<rounded-bbox>". An LRU list is kept at "poi:__lru__"
// to bound the total number of stored entries to POI_CACHE_MAX.
//
// Bbox coordinates are rounded to 2 decimal places (~1 km) so that trivial
// zone adjustments still hit the cache.

const POI_CACHE_MAX = 50;
const POI_LRU_KEY = "poi:__lru__";

function poiStoreKey(type: string, bbox: [number, number, number, number]): string {
    return `poi:${type}:${bbox.map((n) => n.toFixed(2)).join(",")}`;
}

function lruRead(): string[] {
    const raw = getCached(POI_LRU_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
}

function lruTouch(list: string[], key: string): string[] {
    const idx = list.indexOf(key);
    if (idx !== -1) list.splice(idx, 1);
    list.push(key); // most-recently-used goes to the end
    return list;
}

function poiPersistentGet(key: string): Feature<Point>[] | null {
    const raw = getCached(key);
    if (!raw) return null;
    // Promote to MRU position on hit.
    setCached(POI_LRU_KEY, JSON.stringify(lruTouch(lruRead(), key)));
    return JSON.parse(raw) as Feature<Point>[];
}

function poiPersistentSet(key: string, features: Feature<Point>[]): void {
    setCached(key, JSON.stringify(features));
    const lru = lruTouch(lruRead(), key);
    // Evict oldest entries until we're within the cap.
    while (lru.length > POI_CACHE_MAX) {
        deleteCached(lru.shift()!);
    }
    setCached(POI_LRU_KEY, JSON.stringify(lru));
}

// In-flight dedup — prevents duplicate concurrent Overpass requests within a session.
const poiInFlight = new Map<string, Promise<Feature<Point>[]>>();

// ── Admin boundary (IS_IN query) ───────────────────────────────────────────

/**
 * Queries Overpass IS_IN to find the admin boundary polygon
 * (admin_level = adminLevel) containing the given point.
 * Returns the boundary as a GeoJSON Polygon/MultiPolygon feature, or null.
 */
export async function fetchAdminBoundary(
    lat: number,
    lng: number,
    adminLevel: number,
): Promise<Feature<Polygon | MultiPolygon> | null> {
    const key = `${lat},${lng},${adminLevel}`;
    if (adminBoundaryCache.has(key)) return adminBoundaryCache.get(key)!;

    const promise = (async () => {
        const query = `[out:json][timeout:30];is_in(${lat},${lng})->.a;rel(pivot.a)[admin_level="${adminLevel}"][boundary=administrative];out geom qt;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const geo = osmtogeojson(data);
        const feature = geo.features.find(
            (f: any) =>
                f.geometry &&
                (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
        ) as Feature<Polygon | MultiPolygon> | undefined;
        if (!feature) return null;

        // Simplify before caching — raw country/state boundaries can have 100k+
        // coords and make turf.difference/intersect freeze the JS thread.
        return turf.simplify(feature as Feature<Polygon | MultiPolygon>, {
            tolerance: 0.01,
            highQuality: false,
            mutate: false,
        }) as Feature<Polygon | MultiPolygon>;
    })();

    adminBoundaryCache.set(key, promise);
    return promise;
}

// ── Available admin sub-levels (lightweight, tags-only) ───────────────────

export type AdminSubLevel = {
    /** Absolute OSM admin_level value (e.g. 6 for US county). */
    osmLevel: number;
    /** 1-based relative level (1 = first subdivision below the game zone). */
    relativeLevel: number;
    /** Name of the zone at this level that contains the queried point. */
    name: string;
};

/**
 * Queries Overpass IS_IN (tags only — no geometry, fast) to discover what
 * administrative sub-levels exist below the game zone's boundary.
 *
 * zoneOsmId is the OSM relation ID of the game zone (from mapGeoLocation).
 * If the zone relation appears in the IS_IN results its admin_level is used
 * as the baseline; sub-levels are all levels with a higher number.
 * If the zone is not an admin boundary, all found levels are returned.
 */
export async function fetchAvailableAdminLevels(
    anchorLat: number,
    anchorLng: number,
    zoneOsmId: number,
): Promise<AdminSubLevel[]> {
    // Round to ~100 m precision to avoid cache-busting on micro-movements.
    const key = `${anchorLat.toFixed(3)},${anchorLng.toFixed(3)},${zoneOsmId}`;
    if (adminSubLevelsCache.has(key)) return adminSubLevelsCache.get(key)!;

    const promise = (async () => {
        const query = `[out:json][timeout:15];is_in(${anchorLat},${anchorLng})->.a;rel(pivot.a)[boundary=administrative];out tags;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();

        type El = { id: number; tags: Record<string, string> };
        const elements = (data.elements ?? []) as El[];

        // Find the game zone's level by matching its OSM relation ID.
        const zoneEl = elements.find((el) => el.id === zoneOsmId);
        const zoneLevel = zoneEl?.tags.admin_level
            ? parseInt(zoneEl.tags.admin_level, 10)
            : null;

        // Keep only levels that are more specific (higher number) than the zone.
        // If the zone isn't an admin boundary, keep everything.
        const filtered = elements.filter((el) => {
            const lvl = parseInt(el.tags.admin_level ?? "", 10);
            if (isNaN(lvl)) return false;
            return zoneLevel === null ? true : lvl > zoneLevel;
        });

        // Sort ascending (most general first) and deduplicate by osmLevel.
        filtered.sort((a, b) => parseInt(a.tags.admin_level) - parseInt(b.tags.admin_level));
        const seen = new Set<number>();
        const result: AdminSubLevel[] = [];
        for (const el of filtered) {
            const osmLevel = parseInt(el.tags.admin_level, 10);
            if (seen.has(osmLevel)) continue;
            seen.add(osmLevel);
            result.push({
                osmLevel,
                relativeLevel: result.length + 1,
                name: el.tags["name:en"] ?? el.tags["name"] ?? `Level ${result.length + 1}`,
            });
        }
        return result;
    })();

    adminSubLevelsCache.set(key, promise);
    return promise;
}


// ── Airports (Overpass, global) ────────────────────────────────────────────

/**
 * Fetches all IATA commercial airports worldwide from Overpass.
 * Returns a FeatureCollection<Point>.
 */
export async function fetchAirports(): Promise<FeatureCollection<Point>> {
    if (airportsCache.promise) return airportsCache.promise;

    airportsCache.promise = (async () => {
        const query = `[out:json][timeout:60];nwr["aeroway"="aerodrome"]["iata"];out center;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const fc = turf.featureCollection([]) as FeatureCollection<Point>;
        const seenIata = new Set<string>();
        for (const el of data.elements) {
            const iata = el.tags?.["iata"];
            if (!iata || seenIata.has(iata)) continue;
            seenIata.add(iata);
            const coord =
                el.lat != null
                    ? [el.lon, el.lat]
                    : el.center
                      ? [el.center.lon, el.center.lat]
                      : null;
            if (coord) {
                const name = el.tags?.["name:en"] ?? el.tags?.["name"] ?? iata;
                fc.features.push(turf.point(coord, { name, iata }));
            }
        }
        fc.features = fc.features.slice(0, 100);
        return fc;
    })();

    return airportsCache.promise;
}

// ── Major cities (Overpass, global) ───────────────────────────────────────

/**
 * Fetches all cities with population >= 1,000,000 from Overpass.
 * Returns a FeatureCollection<Point>.
 */
export async function fetchMajorCities(): Promise<FeatureCollection<Point>> {
    if (majorCitiesCache.promise) return majorCitiesCache.promise;

    majorCitiesCache.promise = (async () => {
        // Regex: population starts with 1-9 followed by at least 6 digits = ≥1M
        const query = `[out:json][timeout:60];node[place=city]["population"~"^[1-9][0-9]{6,}$"];out center;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const fc = turf.featureCollection([]) as FeatureCollection<Point>;
        for (const el of data.elements) {
            const coord =
                el.lat != null
                    ? [el.lon, el.lat]
                    : el.center
                      ? [el.center.lon, el.center.lat]
                      : null;
            if (coord) {
                const name = el.tags?.["name:en"] ?? el.tags?.["name"];
                if (!name) continue;
                fc.features.push(turf.point(coord, { name }));
            }
        }
        fc.features = fc.features.slice(0, 100);
        return fc;
    })();

    return majorCitiesCache.promise;
}

// ── POI types (Overpass, within bbox) ─────────────────────────────────────

/**
 * Queries Overpass for POI features of the given type within the bounding box.
 * Types: aquarium, zoo, theme_park, peak, museum, hospital, cinema,
 *        library, golf_course, consulate, park
 * Returns FeatureCollection<Point>.
 */
export async function fetchMatchingPOIs(
    type: string,
    bbox: [number, number, number, number],
): Promise<FeatureCollection<Point>> {
    const storeKey = poiStoreKey(type, bbox);

    // 1. Persistent cache hit (synchronous memStore lookup).
    const persisted = poiPersistentGet(storeKey);
    if (persisted) {
        return turf.featureCollection(persisted) as FeatureCollection<Point>;
    }

    // 2. In-flight dedup — return existing promise for the same key.
    const inflight = poiInFlight.get(storeKey);
    if (inflight) {
        return turf.featureCollection(await inflight) as FeatureCollection<Point>;
    }

    // 3. Fetch from Overpass, persist, return.
    const promise = (async (): Promise<Feature<Point>[]> => {
        const tag = (LOCATION_FIRST_TAG as Record<string, string>)[type];
        if (!tag) return [];

        // bbox: [minLng, minLat, maxLng, maxLat] → Overpass: (south,west,north,east)
        const [minLng, minLat, maxLng, maxLat] = bbox;
        const overpassBbox = `(${minLat},${minLng},${maxLat},${maxLng})`;
        const query = `[out:json][timeout:25];nwr["${tag}"="${type}"]${overpassBbox};out center;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();

        const seen = new Set<string>();
        const features: Feature<Point>[] = [];
        for (const el of data.elements) {
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
        const capped = features.slice(0, 100);
        poiPersistentSet(storeKey, capped);
        return capped;
    })();

    poiInFlight.set(storeKey, promise);
    try {
        const features = await promise;
        return turf.featureCollection(features) as FeatureCollection<Point>;
    } finally {
        poiInFlight.delete(storeKey);
    }
}

// ── Voronoi cell lookup ───────────────────────────────────────────────────

/**
 * Given a set of point features, builds a Voronoi diagram and returns
 * the cell that contains [lng, lat]. Returns null if no cell found.
 */
export function findVoronoiCell(
    lng: number,
    lat: number,
    points: FeatureCollection<Point>,
    bboxPadding = 0.2,
): Feature<Polygon> | null {
    if (points.features.length === 0) return null;

    const rawBbox = turf.bbox(points) as [number, number, number, number];
    const [minLng, minLat, maxLng, maxLat] = rawBbox;
    const dLng = (maxLng - minLng) * bboxPadding;
    const dLat = (maxLat - minLat) * bboxPadding;
    const paddedBbox: [number, number, number, number] = [
        minLng - dLng,
        minLat - dLat,
        maxLng + dLng,
        maxLat + dLat,
    ];

    const voronoi = turf.voronoi(points, { bbox: paddedBbox });
    if (!voronoi) return null;

    const searchPoint = turf.point([lng, lat]);
    const cell = voronoi.features.find(
        (f) => f != null && turf.booleanPointInPolygon(searchPoint, f),
    );

    return (cell as Feature<Polygon>) ?? null;
}
