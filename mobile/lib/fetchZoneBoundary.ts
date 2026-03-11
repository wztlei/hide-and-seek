import osmtogeojson from "osmtogeojson";
import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";

import { mapGeoLocation, additionalMapGeoLocations } from "./context";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

// Module-level cache: avoids re-fetching the same zone (e.g. the base location)
// every time an additional location is added/removed in the same session.
const geoJSONCache = new Map<number, FeatureCollection>();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function fetchGeoJSONForZone(
    osmId: number,
    osmType: "W" | "R" | "N",
): Promise<FeatureCollection> {
    const cached = geoJSONCache.get(osmId);
    if (cached) return cached;

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
        const res = await fetch(url);
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
        geoJSONCache.set(osmId, result);
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

    let merged: Feature<Polygon | MultiPolygon> = safeUnion(addedFeatures);

    for (const subtracted of results.filter((x) => !x.added)) {
        const subFeatures = subtracted.data.features as Feature<
            Polygon | MultiPolygon
        >[];
        const diff = turf.difference(
            turf.featureCollection([merged, ...subFeatures]),
        );
        if (diff) merged = diff;
    }

    if (turf.coordAll(merged).length > 10000) {
        turf.simplify(merged, {
            tolerance: 0.0005,
            highQuality: true,
            mutate: true,
        });
    }

    return turf.combine(
        turf.featureCollection([merged]),
    ) as FeatureCollection<MultiPolygon>;
}
