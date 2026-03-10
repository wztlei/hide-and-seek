import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    LineString,
    MultiLineString,
    Point,
} from "geojson";

import { LOCATION_FIRST_TAG, OVERPASS_API } from "../../src/maps/api/constants";

// ── Coastline ─────────────────────────────────────────────────────────────────

// Cached permanently after first load — the coastline never changes.
let coastlineCache: FeatureCollection | null = null;

// URL of the coastline GeoJSON file (same as the deployed web app).
const COASTLINE_URL =
    "https://taibeled.github.io/JetLagHideAndSeek/coastline50.geojson";

/**
 * Loads the Natural Earth 1:50m coastline as a FeatureCollection of
 * LineString features. Cached in-memory permanently after first load.
 *
 * The file is fetched from the deployed GitHub Pages static asset (same URL
 * used by the web app).
 */
export async function fetchCoastline(): Promise<FeatureCollection<LineString>> {
    if (coastlineCache) return coastlineCache as FeatureCollection<LineString>;
    const res = await fetch(COASTLINE_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch coastline: ${res.status}`);
    }
    const data = await res.json();
    coastlineCache = data;
    return data as FeatureCollection<LineString>;
}

// ── Airports ──────────────────────────────────────────────────────────────────

let airportsCache: FeatureCollection<Point> | null = null;

/**
 * Fetches all commercial airports (with IATA codes) from Overpass API.
 * Uses a global bbox query for worldwide coverage. Cached after first load.
 */
export async function fetchAirports(): Promise<FeatureCollection<Point>> {
    if (airportsCache) return airportsCache;
    // Query for all aerodrome nodes/ways that have an IATA code (= commercial airports)
    const query = `[out:json][timeout:60];
nwr["aeroway"="aerodrome"]["iata"](if:count_tags()>0);
out center;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    const fc = turf.featureCollection<Point>([]);
    for (const el of data.elements) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        const iata = el.tags?.iata;
        if (!iata) continue;
        // Deduplicate by IATA code
        if (fc.features.find((f: any) => f.properties?.iata === iata)) continue;
        fc.features.push(turf.point([lon, lat], { iata, name: el.tags?.name }));
    }
    airportsCache = fc;
    return fc;
}

// ── Cities ────────────────────────────────────────────────────────────────────

let citiesCache: FeatureCollection<Point> | null = null;

/**
 * Fetches all cities with population >= 1,000,000 from Overpass API.
 * Cached after first load.
 */
export async function fetchCities(): Promise<FeatureCollection<Point>> {
    if (citiesCache) return citiesCache;
    // Regex matches populations starting with a non-zero digit followed by ≥6 more digits (≥1M)
    const query = `[out:json][timeout:60];
nwr[place=city]["population"~"^[1-9][0-9]{6,}$"];
out center;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    const fc = turf.featureCollection<Point>([]);
    for (const el of data.elements) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        const name = el.tags?.["name:en"] ?? el.tags?.name;
        fc.features.push(turf.point([lon, lat], { name }));
    }
    citiesCache = fc;
    return fc;
}

// ── High-speed rail ───────────────────────────────────────────────────────────

let highSpeedRailCache: FeatureCollection<LineString | MultiLineString> | null = null;

/**
 * Fetches all high-speed rail lines from Overpass API worldwide.
 * Returns a FeatureCollection of LineString/MultiLineString features.
 * Cached after first load.
 */
export async function fetchHighSpeedRail(): Promise<FeatureCollection<LineString | MultiLineString>> {
    if (highSpeedRailCache) return highSpeedRailCache;
    const query = `[out:json][timeout:60];
way["highspeed"="yes"];
out geom;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    const fc = turf.featureCollection<LineString | MultiLineString>([]);
    for (const el of data.elements) {
        if (el.type !== "way" || !el.geometry) continue;
        const coords: [number, number][] = el.geometry.map(
            (node: { lat: number; lon: number }) => [node.lon, node.lat] as [number, number],
        );
        if (coords.length < 2) continue;
        fc.features.push(turf.lineString(coords, { name: el.tags?.name }));
    }
    highSpeedRailCache = fc;
    return fc;
}

// ── POI types via Overpass ────────────────────────────────────────────────────

const poiCache = new Map<string, FeatureCollection<Point>>();

/**
 * Fetches POI features of the given type within the given bbox using Overpass.
 * Supported types match the measuring schema home-game POI types.
 * Results are cached by type+bbox key.
 */
export async function fetchMeasuringPOIs(
    type: string,
    bbox: [number, number, number, number],
): Promise<FeatureCollection<Point>> {
    // Remove "-full" suffix if present (schema uses "aquarium-full" etc.)
    const baseType = type.endsWith("-full") ? type.slice(0, -5) : type;
    const tag = LOCATION_FIRST_TAG[baseType as keyof typeof LOCATION_FIRST_TAG];
    if (!tag) return turf.featureCollection<Point>([]);

    const [west, south, east, north] = bbox;
    const cacheKey = `${baseType}:${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}`;
    if (poiCache.has(cacheKey)) return poiCache.get(cacheKey)!;

    const query = `[out:json][timeout:25];
(
  node["${tag}"="${baseType}"](${south},${west},${north},${east});
  way["${tag}"="${baseType}"](${south},${west},${north},${east});
  relation["${tag}"="${baseType}"](${south},${west},${north},${east});
);
out center;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    const fc = turf.featureCollection<Point>([]);
    for (const el of data.elements) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        const name = el.tags?.["name:en"] ?? el.tags?.name;
        fc.features.push(turf.point([lon, lat], { name }));
    }
    poiCache.set(cacheKey, fc);
    return fc;
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
                const np = turf.nearestPointOnLine(ls, target, { units: "kilometers" });
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
    return nearestPointOnLines(lng, lat, coastline as FeatureCollection<LineString | MultiLineString>);
}
