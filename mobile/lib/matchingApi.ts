import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import osmtogeojson from "osmtogeojson";

import { LOCATION_FIRST_TAG, OVERPASS_API } from "../../src/maps/api/constants";

// ── In-memory caches keyed on stringified params ───────────────────────────

const adminBoundaryCache = new Map<string, Promise<Feature<Polygon | MultiPolygon> | null>>();
const letterZoneCache = new Map<string, Promise<Feature<Polygon | MultiPolygon> | null>>();
const airportsCache: { promise: Promise<FeatureCollection<Point>> | null } = { promise: null };
const majorCitiesCache: { promise: Promise<FeatureCollection<Point>> | null } = { promise: null };
const poisCache = new Map<string, Promise<FeatureCollection<Point>>>();

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
        const query = `[out:json][timeout:30];is_in(${lat},${lng})->.a;rel(pivot.a)[admin_level="${adminLevel}"][boundary=administrative];out geom;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const geo = osmtogeojson(data);
        const feature = geo.features.find(
            (f: any) =>
                f.geometry &&
                (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
        ) as Feature<Polygon | MultiPolygon> | undefined;
        return feature ?? null;
    })();

    adminBoundaryCache.set(key, promise);
    return promise;
}

// ── Letter zone boundary ───────────────────────────────────────────────────

/**
 * Fetches all admin boundaries at `adminLevel` whose names start with the
 * same first letter as the boundary containing (lat, lng).
 * Unions all matching boundaries and returns the result.
 */
export async function fetchLetterZoneBoundary(
    lat: number,
    lng: number,
    adminLevel: number,
): Promise<Feature<Polygon | MultiPolygon> | null> {
    const key = `${lat},${lng},${adminLevel}`;
    if (letterZoneCache.has(key)) return letterZoneCache.get(key)!;

    const promise = (async () => {
        // Step 1: find the admin boundary at (lat, lng) to get its name
        const boundary = await fetchAdminBoundary(lat, lng, adminLevel);
        if (!boundary) return null;

        const props = boundary.properties ?? {};
        const englishName: string | undefined = props["name:en"] ?? props["name"];
        if (!englishName) return null;

        const firstChar = englishName[0];
        if (!/^[a-zA-Z]$/.test(firstChar)) return null;

        const letter = firstChar.toUpperCase();

        // Step 2: find all admin boundaries at this level whose name starts with the same letter
        const query = `[out:json][timeout:60];rel[admin_level="${adminLevel}"][boundary=administrative]["name:en"~"^${letter}.+"];out geom;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const geo = osmtogeojson(data);

        const polygons = geo.features.filter(
            (f: any) =>
                f.geometry &&
                (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
        ) as Feature<Polygon | MultiPolygon>[];

        if (polygons.length === 0) return null;
        if (polygons.length === 1) return polygons[0];

        // Simplify before union to avoid crashes on large datasets
        const simplified = polygons.map((f) =>
            turf.simplify(f as Feature<Polygon | MultiPolygon>, {
                tolerance: 0.001,
                highQuality: true,
                mutate: false,
            }),
        ) as Feature<Polygon | MultiPolygon>[];

        const unioned = simplified.reduce(
            (acc: Feature<Polygon | MultiPolygon> | null, f) => {
                if (acc === null) return f;
                const result = turf.union(turf.featureCollection([acc, f]));
                return result ?? acc;
            },
            null,
        );

        return unioned;
    })();

    letterZoneCache.set(key, promise);
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
        const query = `[out:json][timeout:60];nwr[place=city]["population"~"^[1-9]+[0-9]{6}$"];out center;`;
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
    const key = `${type},${bbox.join(",")}`;
    if (poisCache.has(key)) return poisCache.get(key)!;

    const promise = (async () => {
        const tag = (LOCATION_FIRST_TAG as Record<string, string>)[type];
        if (!tag) return turf.featureCollection([]) as FeatureCollection<Point>;

        // bbox: [minLng, minLat, maxLng, maxLat] → Overpass: (south,west,north,east)
        const [minLng, minLat, maxLng, maxLat] = bbox;
        const overpassBbox = `(${minLat},${minLng},${maxLat},${maxLng})`;
        const query = `[out:json][timeout:60];nwr["${tag}"="${type}"]${overpassBbox};out center;`;
        const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        const fc = turf.featureCollection([]) as FeatureCollection<Point>;
        const seen = new Set<string>();
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
            if (coord) fc.features.push(turf.point(coord, { name }));
        }
        return fc;
    })();

    poisCache.set(key, promise);
    return promise;
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
