import osmtogeojson from 'osmtogeojson';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import { mapGeoLocation, additionalMapGeoLocations } from './context';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

async function fetchGeoJSONForZone(
  osmId: number,
  osmType: 'W' | 'R' | 'N',
): Promise<FeatureCollection> {
  const typeMap = { W: 'way', R: 'relation', N: 'node' } as const;
  const query = `[out:json];${typeMap[osmType]}(${osmId});out geom;`;
  const res = await fetch(`${OVERPASS_API}?data=${encodeURIComponent(query)}`);
  const data = await res.json();
  const geo = osmtogeojson(data);
  return { ...geo, features: geo.features.filter((f: any) => f.geometry.type !== 'Point') };
}

// Inline safeUnion — operators.ts is not RN-safe due to @arcgis/core import
function safeUnion(
  features: Feature<Polygon | MultiPolygon>[],
): Feature<Polygon | MultiPolygon> {
  if (features.length === 1) return features[0];
  const result = turf.union(turf.featureCollection(features));
  if (result) return result;
  throw new Error('Zone union failed');
}

export async function fetchAllZoneBoundaries(): Promise<FeatureCollection<MultiPolygon>> {
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
    const subFeatures = subtracted.data.features as Feature<Polygon | MultiPolygon>[];
    const diff = turf.difference(turf.featureCollection([merged, ...subFeatures]));
    if (diff) merged = diff;
  }

  if (turf.coordAll(merged).length > 10000) {
    turf.simplify(merged, { tolerance: 0.0005, highQuality: true, mutate: true });
  }

  return turf.combine(turf.featureCollection([merged])) as FeatureCollection<MultiPolygon>;
}
