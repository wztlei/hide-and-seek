import * as turf from "@turf/turf";
import type { Feature, LineString, Polygon } from "geojson";

function trunc<T extends Feature>(f: T): T {
    return turf.truncate(f, { precision: 6, mutate: true }) as T;
}

import type { Questions } from "../../src/maps/schema";

type RadiusQuestion = Extract<Questions[number], { id: "radius" }>;
type ThermometerQuestion = Extract<Questions[number], { id: "thermometer" }>;
type TentaclesQuestion = Extract<Questions[number], { id: "tentacles" }>;

/**
 * Returns the circle polygon for a radius question (used for the outline layer).
 * 64 steps gives a smooth circle at any zoom level.
 */
export function radiusCircle(q: RadiusQuestion): Feature<Polygon> {
    return trunc(
        turf.circle([q.data.lng, q.data.lat], q.data.radius, {
            units: q.data.unit,
            steps: 64,
        }),
    );
}

/**
 * Returns the geodesic perpendicular bisector of A↔B as a LineString.
 *
 * Samples the great-circle arc at 20 km intervals so MapLibre renders a
 * geodesically accurate line rather than a Mercator-distorted straight segment.
 * Extends 2000 km either side of the midpoint to span any viewport.
 */
export function thermometerBisector(
    q: ThermometerQuestion,
): Feature<LineString> {
    const ptA = turf.point([q.data.lngA, q.data.latA]);
    const ptB = turf.point([q.data.lngB, q.data.latB]);
    const mid = turf.midpoint(ptA, ptB);
    const bearing = turf.bearing(ptA, ptB);

    const step = 20; // km between samples — ~8 m max sagitta
    const reach = 2000; // km each side of midpoint
    const coords: [number, number][] = [];

    for (let d = reach; d >= step; d -= step) {
        coords.push(
            turf.destination(mid, d, bearing - 90, { units: "kilometers" })
                .geometry.coordinates as [number, number],
        );
    }
    coords.push(mid.geometry.coordinates as [number, number]);
    for (let d = step; d <= reach; d += step) {
        coords.push(
            turf.destination(mid, d, bearing + 90, { units: "kilometers" })
                .geometry.coordinates as [number, number],
        );
    }

    return trunc(turf.lineString(coords));
}

/**
 * Returns the circle polygon for a tentacles question (used for the outline layer).
 * 64 steps gives a smooth circle at any zoom level.
 */
export function tentaclesCircle(q: TentaclesQuestion): Feature<Polygon> {
    return trunc(
        turf.circle([q.data.lng, q.data.lat], q.data.radius, {
            units: q.data.unit,
            steps: 64,
        }),
    );
}
