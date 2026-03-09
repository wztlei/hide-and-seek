import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { useEffect, useState } from "react";

import type { Questions } from "../../src/maps/schema";
import { mapGeoJSON, questions } from "../lib/context";

export type RadiusRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
};

export type ThermometerRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
};

/**
 * Computes per-question eliminated / valid regions and the base zone fill.
 *
 * Design rule: only the area directly eliminated by a question is shaded
 * with that question's colour. Uneliminated areas are left clear.
 *
 * - `eliminationMask`   — world minus game zone (base indigo fill, always).
 * - `zoneBoundary`      — raw game zone polygon (always-visible boundary line).
 * - `radiusRegions`     — per radius question: the portion of the game zone
 *                         eliminated by that circle (clipped to game zone).
 *                         within=true  → gameZone minus circle (the outer ring)
 *                         within=false → gameZone intersected with circle
 * - `thermometerRegions`— per thermometer question: the valid Voronoi half
 *                         (the "closer point" side) clipped to the game zone,
 *                         rendered as a positive fill to show where the hider is.
 */
export function useEliminationMask() {
    const $mapGeoJSON = useStore(mapGeoJSON);
    const $questions = useStore(questions) as Questions;

    const [eliminationMask, setEliminationMask] = useState<Feature<
        Polygon | MultiPolygon
    > | null>(null);
    const [zoneBoundary, setZoneBoundary] = useState<Feature<
        Polygon | MultiPolygon
    > | null>(null);
    const [radiusRegions, setRadiusRegions] = useState<RadiusRegion[]>([]);
    const [thermometerRegions, setThermometerRegions] = useState<
        ThermometerRegion[]
    >([]);

    useEffect(() => {
        if (!$mapGeoJSON) {
            // Keep previous visuals while a new boundary is loading.
            return;
        }
        try {
            const features = $mapGeoJSON.features as Feature<
                Polygon | MultiPolygon
            >[];
            const world: Feature<Polygon> = {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [-180, -90],
                            [180, -90],
                            [180, 90],
                            [-180, 90],
                            [-180, -90],
                        ],
                    ],
                },
            };

            // turf.union requires ≥2 features; use single feature directly.
            const zoneOrNull: Feature<Polygon | MultiPolygon> | null =
                features.length === 1
                    ? features[0]
                    : turf.union(turf.featureCollection(features));
            if (!zoneOrNull) return;

            setZoneBoundary(zoneOrNull);

            // Base elimination mask: world minus game zone (no questions applied).
            setEliminationMask(
                turf.difference(turf.featureCollection([world, zoneOrNull])),
            );

            // ── Radius: eliminated portion per question ───────────────────────
            const newRadiusRegions: RadiusRegion[] = [];
            for (const q of $questions) {
                if (q.id !== "radius") continue;
                const { lat, lng, radius, unit, within } = q.data;
                const circle = turf.circle([lng, lat], radius, {
                    units: unit,
                    steps: 64,
                });
                const eliminated = within
                    // within=true: valid area is inside circle → eliminate the ring outside
                    ? turf.difference(turf.featureCollection([zoneOrNull, circle]))
                    // within=false: valid area is outside circle → eliminate the circle
                    : turf.intersect(turf.featureCollection([zoneOrNull, circle]));
                if (eliminated) {
                    newRadiusRegions.push({ key: q.key, region: eliminated });
                }
            }
            setRadiusRegions(newRadiusRegions);

            // ── Thermometer: valid half per question ──────────────────────────
            // Uses the same geodesic perpendicular-bisector construction as
            // MapLayers so the fill exactly matches the rendered dividing line.
            const newThermRegions: ThermometerRegion[] = [];
            for (const q of $questions) {
                if (q.id !== "thermometer") continue;
                const { latA, lngA, latB, lngB, warmer } = q.data;

                const ptA = turf.point([lngA, latA]);
                const ptB = turf.point([lngB, latB]);
                const mid = turf.midpoint(ptA, ptB);
                const abBearing = turf.bearing(ptA, ptB);

                // Build the geodesic bisector edge with many intermediate points
                // (same algorithm as MapLayers) so the half-plane polygon is
                // accurate at any map scale.
                const step = 20;
                const reach = 5000;
                const bisectorCoords: [number, number][] = [];
                for (let d = reach; d >= step; d -= step) {
                    bisectorCoords.push(
                        turf.destination(mid, d, abBearing - 90, { units: "kilometers" })
                            .geometry.coordinates as [number, number],
                    );
                }
                bisectorCoords.push(mid.geometry.coordinates as [number, number]);
                for (let d = step; d <= reach; d += step) {
                    bisectorCoords.push(
                        turf.destination(mid, d, abBearing + 90, { units: "kilometers" })
                            .geometry.coordinates as [number, number],
                    );
                }

                // Close the half-plane on the valid side by adding two far
                // corners behind the valid point, then closing to the start.
                // warmer=true → valid side is B (abBearing direction from mid)
                // warmer=false → valid side is A (abBearing+180 direction)
                const validBearing = warmer ? abBearing : abBearing + 180;
                const farRight = turf.destination(
                    turf.point(bisectorCoords[bisectorCoords.length - 1]),
                    reach,
                    validBearing,
                    { units: "kilometers" },
                ).geometry.coordinates as [number, number];
                const farLeft = turf.destination(
                    turf.point(bisectorCoords[0]),
                    reach,
                    validBearing,
                    { units: "kilometers" },
                ).geometry.coordinates as [number, number];

                const halfPlane = turf.polygon([[
                    ...bisectorCoords,
                    farRight,
                    farLeft,
                    bisectorCoords[0],
                ]]);

                const clipped = turf.intersect(
                    turf.featureCollection([zoneOrNull, halfPlane]),
                );
                if (clipped) {
                    newThermRegions.push({ key: q.key, region: clipped });
                }
            }
            setThermometerRegions(newThermRegions);
        } catch (e) {
            console.error("Failed to compute zone mask:", e);
        }
    }, [$mapGeoJSON, $questions]);

    return { eliminationMask, zoneBoundary, radiusRegions, thermometerRegions };
}
