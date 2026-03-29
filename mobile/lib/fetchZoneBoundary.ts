import osmtogeojson from "osmtogeojson";
import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";

import {
    mapGeoLocation,
    additionalMapGeoLocations,
    polyGeoJSON,
} from "./context";
import { overpassFetch } from "./overpassFetch";
import { getCached, setCached } from "./storage";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

// Module-level cache: avoids re-fetching the same zone within a session.
const geoJSONCache = new Map<number, FeatureCollection>();

// Bundled zone GeoJSON for known default zones — used on first install to
// avoid an Overpass round-trip before AsyncStorage cache is populated.
const BUNDLED_ZONES: Partial<Record<number, FeatureCollection>> = {
    111968: require("../assets/default-zones/sf.json") as FeatureCollection,
};

function zoneGeoKey(osmId: number): string {
    return `zone-geo:${osmId}`;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function fetchGeoJSONForZone(
    osmId: number,
    osmType: "W" | "R" | "N",
): Promise<FeatureCollection> {
    const cached = geoJSONCache.get(osmId);
    if (cached) return cached;

    const persistedRaw = getCached(zoneGeoKey(osmId));
    if (persistedRaw) {
        try {
            const persisted = JSON.parse(persistedRaw) as FeatureCollection;
            geoJSONCache.set(osmId, persisted);
            return persisted;
        } catch {
            // Corrupted entry — fall through to re-fetch.
        }
    }

    // Use bundled asset on first install to avoid an Overpass round-trip.
    // Seed both caches so subsequent calls return immediately.
    const bundled = BUNDLED_ZONES[osmId];
    if (bundled) {
        geoJSONCache.set(osmId, bundled);
        setCached(zoneGeoKey(osmId), JSON.stringify(bundled));
        return bundled;
    }

    const typeMap = { W: "way", R: "relation", N: "node" } as const;
    // [timeout:60] tells Overpass to allow up to 60 s of server-side processing
    // before giving up (default is 25 s, which is too short for large relations).
    const query = `[out:json][timeout:60];${typeMap[osmType]}(${osmId});out geom qt;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
        const res = await overpassFetch(url, { query_type: "zone_boundary", osm_id: osmId, osm_type: osmType });
        if (res.status === 429 || res.status >= 500) {
            lastError = new Error(
                `Overpass API error ${res.status} for osm_id ${osmId}`,
            );
            continue; // retry
        }
        if (!res.ok) {
            throw new Error(
                `Overpass API error ${res.status} for osm_id ${osmId}`,
            );
        }
        const data = await res.json();
        const geo = osmtogeojson(data);
        const result: FeatureCollection = {
            ...geo,
            features: geo.features.filter(
                (f: any) => f.geometry.type !== "Point",
            ),
        };
        // Simplify before caching to reduce storage size and speed up subsequent reads.
        // Tolerance of 0.001° ≈ 111 m — negligible for game use.
        turf.simplify(result as any, {
            tolerance: 0.001,
            highQuality: false,
            mutate: true,
        });
        geoJSONCache.set(osmId, result);
        setCached(zoneGeoKey(osmId), JSON.stringify(result));
        return result;
    }
    throw lastError ?? new Error(`Overpass API failed for osm_id ${osmId}`);
}

// Inline safeUnion — operators.ts is not RN-safe due to @arcgis/core import
function safeUnion(
    features: Feature<Polygon | MultiPolygon>[],
): Feature<Polygon | MultiPolygon> {
    if (features.length === 1) return features[0];
    const result = turf.union(turf.featureCollection(features));
    if (result) return result;
    throw new Error("Zone union failed");
}

export async function fetchAllZoneBoundaries(): Promise<
    FeatureCollection<MultiPolygon>
> {
    const locations = [
        { location: mapGeoLocation.get(), added: true },
        ...additionalMapGeoLocations.get(),
    ];

    const results = await Promise.all(
        locations.map(async (loc) => ({
            added: loc.added,
            data: await fetchGeoJSONForZone(
                loc.location.properties.osm_id,
                loc.location.properties.osm_type,
            ),
        })),
    );

    const addedFeatures = results
        .filter((x) => x.added)
        .flatMap((x) => x.data.features) as Feature<Polygon | MultiPolygon>[];

    const poly = polyGeoJSON.get();
    const polySubtracted: Feature<Polygon | MultiPolygon>[] = [];
    if (poly) {
        for (const f of poly.features as Feature<Polygon | MultiPolygon>[]) {
            if (f.properties?.added === false) {
                polySubtracted.push(f);
            } else {
                addedFeatures.push(f);
            }
        }
    }

    // Pre-simplify (non-mutating — preserves the in-memory geoJSONCache entries)
    // before boolean ops. 0.005° ≈ 550 m, adequate for game zone boundaries.
    const simplifiedForOps = addedFeatures.map(
        (f) =>
            turf.simplify(f, {
                tolerance: 0.005,
                highQuality: false,
            }) as Feature<Polygon | MultiPolygon>,
    );

    let merged: Feature<Polygon | MultiPolygon> = safeUnion(simplifiedForOps);

    for (const subtracted of results.filter((x) => !x.added)) {
        const subFeatures = (
            subtracted.data.features as Feature<Polygon | MultiPolygon>[]
        ).map(
            (f) =>
                turf.simplify(f, {
                    tolerance: 0.005,
                    highQuality: false,
                }) as Feature<Polygon | MultiPolygon>,
        );
        const diff = turf.difference(
            turf.featureCollection([merged, ...subFeatures]),
        );
        if (diff) merged = diff;
    }

    for (const subFeature of polySubtracted) {
        const simplified = turf.simplify(subFeature, {
            tolerance: 0.005,
            highQuality: false,
        }) as Feature<Polygon | MultiPolygon>;
        const diff = turf.difference(
            turf.featureCollection([merged, simplified]),
        );
        if (diff) merged = diff;
    }

    const coordCount = turf.coordAll(merged).length;
    if (coordCount > 500) {
        turf.simplify(merged, {
            tolerance: 0.005,
            highQuality: false,
            mutate: true,
        });
    }

    const combined = turf.combine(
        turf.featureCollection([merged]),
    ) as FeatureCollection<MultiPolygon>;
    return combined;
}
