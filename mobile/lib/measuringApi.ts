import * as Sentry from "@sentry/react-native";
import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    LineString,
    MultiLineString,
    Point,
} from "geojson";

import { LOCATION_FIRST_TAG, OVERPASS_API } from "../../src/maps/api/constants";
import { deleteCached, getCached, setCached } from "./storage";

// ── Persistent LRU cache (airports, cities, POI types) ────────────────────────
//
// Entries are stored in AsyncStorage (via the memStore mirror in storage.ts)
// under keys "meas-poi:<type>:<rounded-bbox>". An LRU list is kept at
// "meas-poi:__lru__" to bound the total number of stored entries to
// MEAS_POI_CACHE_MAX.  Bbox coordinates are rounded to 2 decimal places
// (~1 km) so trivial zone adjustments still hit the cache.
//
// The "meas-poi:" prefix keeps measuring entries separate from matching's
// "poi:" namespace.

const MEAS_POI_CACHE_MAX = 50;
const MEAS_POI_LRU_KEY = "meas-poi:__lru__";

function measStoreKey(
    type: string,
    bbox: [number, number, number, number],
): string {
    return `meas-poi:${type}:${bbox.map((n) => n.toFixed(2)).join(",")}`;
}

function lruRead(): string[] {
    const raw = getCached(MEAS_POI_LRU_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
}

function lruTouch(list: string[], key: string): string[] {
    const idx = list.indexOf(key);
    if (idx !== -1) list.splice(idx, 1);
    list.push(key); // most-recently-used goes to the end
    return list;
}

function measPersistentGet(key: string): Feature<Point>[] | null {
    const raw = getCached(key);
    if (!raw) return null;
    setCached(MEAS_POI_LRU_KEY, JSON.stringify(lruTouch(lruRead(), key)));
    return JSON.parse(raw) as Feature<Point>[];
}

function measPersistentSet(key: string, features: Feature<Point>[]): void {
    setCached(key, JSON.stringify(features));
    const lru = lruTouch(lruRead(), key);
    while (lru.length > MEAS_POI_CACHE_MAX) {
        deleteCached(lru.shift()!);
    }
    setCached(MEAS_POI_LRU_KEY, JSON.stringify(lru));
}

// In-flight dedup — prevents duplicate concurrent Overpass requests within a session.
const measPoiInFlight = new Map<string, Promise<Feature<Point>[]>>();

// ── Coastline ─────────────────────────────────────────────────────────────────

// Cached permanently after first load — the coastline never changes.
let coastlineCache: FeatureCollection | null = null;

// URL of the coastline GeoJSON file (same as the deployed web app).
const COASTLINE_URL =
    "https://taibeled.github.io/JetLagHideAndSeek/coastline50.geojson";

/**
 * Loads the Natural Earth 1:50m coastline as a FeatureCollection of
 * LineString features. Cached in-memory permanently after first load.
 */
export async function fetchCoastline(): Promise<FeatureCollection<LineString>> {
    if (coastlineCache) return coastlineCache as FeatureCollection<LineString>;
    const res = await fetch(COASTLINE_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch coastline: ${res.status}`);
    }
    const data = await res.json();
    Sentry.addBreadcrumb({
        category: "api",
        message: "Fetched coastline GeoJSON",
        level: "info",
    });
    coastlineCache = data;
    return data as FeatureCollection<LineString>;
}

// ── Airports ──────────────────────────────────────────────────────────────────

/**
 * Fetches commercial airports (with IATA codes) from Overpass API within the
 * given bounding box. Persistently cached per bbox.
 */
export async function fetchAirports(
    bbox: [number, number, number, number],
): Promise<FeatureCollection<Point>> {
    const storeKey = measStoreKey("airport", bbox);

    const persisted = measPersistentGet(storeKey);
    if (persisted)
        return turf.featureCollection(persisted) as FeatureCollection<Point>;

    const inflight = measPoiInFlight.get(storeKey);
    if (inflight)
        return turf.featureCollection(
            await inflight,
        ) as FeatureCollection<Point>;

    const promise = (async (): Promise<Feature<Point>[]> => {
        const [west, south, east, north] = bbox;
        // node+way only — aerodrome relations don't carry per-airport IATA codes.
        // qt (quadtile order) enables streaming output for lower latency.
        const query = `[out:json][timeout:30];(node["aeroway"="aerodrome"]["iata"](${south},${west},${north},${east});way["aeroway"="aerodrome"]["iata"](${south},${west},${north},${east}););out center qt;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Overpass airports ${res.status}`);
        const data = await res.json();
        const seen = new Set<string>();
        const features: Feature<Point>[] = [];
        for (const el of data.elements) {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (lat == null || lon == null) continue;
            const iata = el.tags?.iata;
            if (!iata || seen.has(iata)) continue;
            seen.add(iata);
            features.push(
                turf.point([lon, lat], { iata, name: el.tags?.name }),
            );
        }
        measPersistentSet(storeKey, features);
        return features;
    })();

    measPoiInFlight.set(storeKey, promise);
    try {
        const features = await promise;
        return turf.featureCollection(features) as FeatureCollection<Point>;
    } finally {
        measPoiInFlight.delete(storeKey);
    }
}

// ── Cities ────────────────────────────────────────────────────────────────────

/**
 * Fetches cities with population >= 1,000,000 from Overpass API within the
 * given bounding box. Persistently cached per bbox.
 */
export async function fetchCities(
    bbox: [number, number, number, number],
): Promise<FeatureCollection<Point>> {
    const storeKey = measStoreKey("city", bbox);

    const persisted = measPersistentGet(storeKey);
    if (persisted)
        return turf.featureCollection(persisted) as FeatureCollection<Point>;

    const inflight = measPoiInFlight.get(storeKey);
    if (inflight)
        return turf.featureCollection(
            await inflight,
        ) as FeatureCollection<Point>;

    const promise = (async (): Promise<Feature<Point>[]> => {
        const [west, south, east, north] = bbox;
        const query = `[out:json][timeout:30];node[place=city]["population"~"^[1-9][0-9]{6,}$"](${south},${west},${north},${east});out qt;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Overpass cities ${res.status}`);
        const data = await res.json();
        const features: Feature<Point>[] = [];
        for (const el of data.elements) {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (lat == null || lon == null) continue;
            const name = el.tags?.["name:en"] ?? el.tags?.name;
            features.push(turf.point([lon, lat], { name }));
        }
        measPersistentSet(storeKey, features);
        return features;
    })();

    measPoiInFlight.set(storeKey, promise);
    try {
        const features = await promise;
        return turf.featureCollection(features) as FeatureCollection<Point>;
    } finally {
        measPoiInFlight.delete(storeKey);
    }
}

// ── High-speed rail ───────────────────────────────────────────────────────────

let highSpeedRailCache: FeatureCollection<LineString | MultiLineString> | null =
    null;

/**
 * Fetches all high-speed rail lines from Overpass API worldwide.
 * Returns a FeatureCollection of LineString/MultiLineString features.
 * Cached after first load.
 */
export async function fetchHighSpeedRail(): Promise<
    FeatureCollection<LineString | MultiLineString>
> {
    if (highSpeedRailCache) return highSpeedRailCache;
    const query = `[out:json][timeout:60];way["railway"]["highspeed"="yes"];out geom qt;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Overpass high-speed rail ${res.status}`);
    const data = await res.json();
    Sentry.addBreadcrumb({
        category: "api",
        message: `Fetched ${data.elements?.length ?? 0} rail segments`,
        level: "info",
    });
    const fc = turf.featureCollection<LineString | MultiLineString>([]);
    for (const el of data.elements) {
        if (el.type !== "way" || !el.geometry) continue;
        const coords: [number, number][] = el.geometry.map(
            (node: { lat: number; lon: number }) =>
                [node.lon, node.lat] as [number, number],
        );
        if (coords.length < 2) continue;
        fc.features.push(turf.lineString(coords, { name: el.tags?.name }));
    }
    highSpeedRailCache = fc;
    return fc;
}

// ── POI types via Overpass ────────────────────────────────────────────────────

/**
 * Fetches POI features of the given type within the given bbox using Overpass.
 * Supported types match the measuring schema home-game POI types.
 * Results are persistently cached by type+bbox key.
 */
export async function fetchMeasuringPOIs(
    type: string,
    bbox: [number, number, number, number],
): Promise<FeatureCollection<Point>> {
    // Remove "-full" suffix if present (schema uses "aquarium-full" etc.)
    const baseType = type.endsWith("-full") ? type.slice(0, -5) : type;
    const tag = LOCATION_FIRST_TAG[baseType as keyof typeof LOCATION_FIRST_TAG];
    if (!tag) return turf.featureCollection<Point>([]);

    const storeKey = measStoreKey(baseType, bbox);

    const persisted = measPersistentGet(storeKey);
    if (persisted)
        return turf.featureCollection(persisted) as FeatureCollection<Point>;

    const inflight = measPoiInFlight.get(storeKey);
    if (inflight)
        return turf.featureCollection(
            await inflight,
        ) as FeatureCollection<Point>;

    const promise = (async (): Promise<Feature<Point>[]> => {
        const [west, south, east, north] = bbox;
        const query = `[out:json][timeout:25];nwr["${tag}"="${baseType}"](${south},${west},${north},${east});out center;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Overpass POI ${baseType} ${res.status}`);
        const data = await res.json();
        const features: Feature<Point>[] = [];
        for (const el of data.elements) {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (lat == null || lon == null) continue;
            const name = el.tags?.["name:en"] ?? el.tags?.name;
            features.push(turf.point([lon, lat], { name }));
        }
        const capped = features.slice(0, 100);
        measPersistentSet(storeKey, capped);
        return capped;
    })();

    measPoiInFlight.set(storeKey, promise);
    try {
        const features = await promise;
        return turf.featureCollection(features) as FeatureCollection<Point>;
    } finally {
        measPoiInFlight.delete(storeKey);
    }
}

// ── Admin boundaries ──────────────────────────────────────────────────────────

const MEAS_LINE_CACHE_MAX = 20;
const MEAS_LINE_LRU_KEY = "meas-line:__lru__";

function measLineStoreKey(
    level: number,
    bbox: [number, number, number, number],
): string {
    // Append "x" for level-2 entries that use the ISO-filter variant of the query,
    // so stale entries cached without the filter are never returned.
    const variant = level === 2 ? "x" : "";
    return `meas-line:${level}${variant}:${bbox.map((n) => n.toFixed(2)).join(",")}`;
}

function measLinePersistentGet(key: string): Feature<LineString>[] | null {
    const raw = getCached(key);
    if (!raw) return null;
    const lru = JSON.parse(getCached(MEAS_LINE_LRU_KEY) ?? "[]") as string[];
    const idx = lru.indexOf(key);
    if (idx !== -1) lru.splice(idx, 1);
    lru.push(key);
    setCached(MEAS_LINE_LRU_KEY, JSON.stringify(lru));
    return JSON.parse(raw) as Feature<LineString>[];
}

function measLinePersistentSet(
    key: string,
    features: Feature<LineString>[],
): void {
    setCached(key, JSON.stringify(features));
    const lru = JSON.parse(getCached(MEAS_LINE_LRU_KEY) ?? "[]") as string[];
    const idx = lru.indexOf(key);
    if (idx !== -1) lru.splice(idx, 1);
    lru.push(key);
    while (lru.length > MEAS_LINE_CACHE_MAX) {
        deleteCached(lru.shift()!);
    }
    setCached(MEAS_LINE_LRU_KEY, JSON.stringify(lru));
}

const measLineInFlight = new Map<string, Promise<Feature<LineString>[]>>();

/**
 * Fetches administrative boundary lines for the given admin_level from Overpass
 * within the given bounding box. Returns a FeatureCollection of LineString features.
 * Persistently cached per level+bbox.
 */
export async function fetchAdminBoundaries(
    adminLevel: number,
    bbox: [number, number, number, number],
): Promise<FeatureCollection<LineString>> {
    const storeKey = measLineStoreKey(adminLevel, bbox);

    const persisted = measLinePersistentGet(storeKey);
    if (persisted)
        return turf.featureCollection(
            persisted,
        ) as FeatureCollection<LineString>;

    const inflight = measLineInFlight.get(storeKey);
    if (inflight)
        return turf.featureCollection(
            await inflight,
        ) as FeatureCollection<LineString>;

    const promise = (async (): Promise<Feature<LineString>[]> => {
        const [west, south, east, north] = bbox;
        // Query member ways directly within the bbox — NOT the parent relation.
        // "relation ... out geom" returns ALL member ways of matching relations
        // (regardless of bbox), so a small bbox near SF still returns the entire
        // US national boundary. Instead, we find matching relations then immediately
        // recurse into only their ways that fall within the bbox.
        //
        // For level 2 (international borders) we also exclude national-boundary
        // relations (tagged with ISO3166-1 / ISO3166-1:alpha2 — single-country codes).
        // Those relations include coastal segments that would be nearest to any
        // coastal city, drowning out the actual land border. Bilateral border
        // relations (e.g. US-Mexico border) don't carry ISO3166-1 tags.
        const isoFilter =
            adminLevel === 2 ? `[!"ISO3166-1"][!"ISO3166-1:alpha2"]` : "";
        const query = `[out:json][timeout:60];rel["boundary"="administrative"]["admin_level"="${adminLevel}"]${isoFilter}(${south},${west},${north},${east})->.rels;way(r.rels)(${south},${west},${north},${east});out geom;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;

        const res = await fetch(url);
        if (!res.ok)
            throw new Error(
                `Overpass admin boundaries level ${adminLevel} ${res.status}`,
            );

        const text = await res.text();
        const data = JSON.parse(text) as { elements: any[] };
        Sentry.addBreadcrumb({
            category: "api",
            message: `Fetched admin level ${adminLevel} boundaries`,
            level: "info",
        });

        const features: Feature<LineString>[] = [];
        for (const el of data.elements) {
            // New query returns way elements directly (not relation members).
            if (el.type !== "way" || !el.geometry) continue;
            const coords: [number, number][] = (
                el.geometry as { lat: number; lon: number }[]
            ).map((node) => [node.lon, node.lat] as [number, number]);
            if (coords.length < 2) continue;
            features.push(turf.lineString(coords));
        }

        // Cap at 500 way-member segments to bound parse time and memory.
        const capped = features.slice(0, 500);
        measLinePersistentSet(storeKey, capped);
        return capped;
    })();

    measLineInFlight.set(storeKey, promise);
    try {
        const features = await promise;
        return turf.featureCollection(
            features,
        ) as FeatureCollection<LineString>;
    } finally {
        measLineInFlight.delete(storeKey);
    }
}

// ── Distance helpers ──────────────────────────────────────────────────────────

/**
 * Given a FeatureCollection<Point>, finds the nearest point to [lng, lat]
 * and returns { nearest, distanceKm }.
 */
export function nearestPointAndDistance(
    lng: number,
    lat: number,
    points: FeatureCollection<Point>,
): { nearest: Feature<Point>; distanceKm: number } | null {
    if (points.features.length === 0) return null;
    const target = turf.point([lng, lat]);
    const nearest = turf.nearestPoint(target, points);
    const distanceKm = turf.distance(target, nearest, { units: "kilometers" });
    return { nearest, distanceKm };
}

/**
 * For a FeatureCollection of LineStrings / MultiLineStrings:
 * finds the nearest point on any segment to [lng, lat].
 * Returns { nearestCoord, distanceKm } for the closest match across all features.
 */
export function nearestPointOnLines(
    lng: number,
    lat: number,
    lines: FeatureCollection<LineString | MultiLineString>,
): { nearestCoord: [number, number]; distanceKm: number } | null {
    if (lines.features.length === 0) return null;
    const target = turf.point([lng, lat]);
    let bestDist = Infinity;
    let bestCoord: [number, number] | null = null;

    for (const feature of lines.features) {
        // Expand MultiLineString into individual LineStrings for nearestPointOnLine
        const lineStrings: Feature<LineString>[] =
            feature.geometry.type === "MultiLineString"
                ? feature.geometry.coordinates.map((coords) =>
                      turf.lineString(coords as [number, number][]),
                  )
                : [feature as Feature<LineString>];

        for (const ls of lineStrings) {
            try {
                const np = turf.nearestPointOnLine(ls, target, {
                    units: "kilometers",
                });
                const dist = np.properties.dist ?? Infinity;
                if (dist < bestDist) {
                    bestDist = dist;
                    bestCoord = np.geometry.coordinates as [number, number];
                }
            } catch {
                // Skip degenerate segments
            }
        }
    }

    if (bestCoord === null) return null;
    return { nearestCoord: bestCoord, distanceKm: bestDist };
}

/**
 * For the coastline FeatureCollection<LineString>:
 * finds the nearest point on any coastline segment to [lng, lat].
 * Delegates to nearestPointOnLines after wrapping the FeatureCollection.
 */
export function nearestPointOnCoastline(
    lng: number,
    lat: number,
    coastline: FeatureCollection<LineString>,
): { nearestCoord: [number, number]; distanceKm: number } | null {
    return nearestPointOnLines(
        lng,
        lat,
        coastline as FeatureCollection<LineString | MultiLineString>,
    );
}
