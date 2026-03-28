/**
 * Fetches the San Francisco zone boundary from Overpass and saves it as a
 * bundled asset. Run once (or when you want to refresh the bundled data):
 *
 *   node mobile/scripts/generate-default-zone.mjs
 */
import osmtogeojson from "osmtogeojson";
import * as turf from "@turf/turf";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OSM_ID = 111968; // San Francisco (relation)

const query = `[out:json][timeout:60];relation(${OSM_ID});out geom qt;`;
const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;

console.log(`Fetching relation ${OSM_ID} from Overpass...`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
const data = await res.json();

console.log("Converting to GeoJSON...");
const geo = osmtogeojson(data);
const result = {
    ...geo,
    features: geo.features.filter((f) => f.geometry.type !== "Point"),
};

// Match the simplification applied in fetchGeoJSONForZone
turf.simplify(result, { tolerance: 0.001, highQuality: false, mutate: true });

const outDir = join(__dirname, "../assets/default-zones");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "sf.json");
const json = JSON.stringify(result);
writeFileSync(outPath, json);
console.log(
    `Written to ${outPath} (${(json.length / 1024).toFixed(1)} KB, ${result.features.length} features)`,
);
