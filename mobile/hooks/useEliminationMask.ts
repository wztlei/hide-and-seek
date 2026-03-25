import * as Sentry from "@sentry/react-native";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import { startTransition, useEffect, useState } from "react";

import type { Question, Questions } from "../../src/maps/schema";
import { mapGeoJSON, questions } from "../lib/context";
import { toast } from "../lib/notifications";
import {
    fetchAdminBoundary,
    fetchAirports,
    fetchMajorCities,
    fetchMatchingPOIs,
    findVoronoiCell,
} from "../lib/matchingApi";
import {
    fetchAdminBoundaries,
    fetchAirports as fetchMeasuringAirports,
    fetchCities,
    fetchCoastline,
    fetchHighSpeedRail,
    fetchMeasuringPOIs,
    nearestPointOnCoastline,
    nearestPointOnLines,
} from "../lib/measuringApi";
import { fetchTentacleLocations } from "../lib/tentacleApi";

export type RadiusRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
};

export type ThermometerRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
};

export type TentaclesRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
    /** null in outside mode (no specific location selected) */
    location: Feature<Point> | null;
    pois: Feature<Point>[];
};

export type MatchingRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
    /** POIs that form the Voronoi diagram (POI types only; empty for zone/airport/city). */
    pois: Feature<Point>[];
};

export type MeasuringRegion = {
    key: number;
    region: Feature<Polygon | MultiPolygon>;
    /** POIs used as distance reference (fetched around the active search center). */
    pois: Feature<Point>[];
    /** Per-POI buffer circles. */
    circles: Feature<Polygon>[];
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
 * - `tentaclesRegions`  — per tentacles question: the selected POI's Voronoi cell
 *                         clipped to the radius circle and game zone.
 */
export function useEliminationMask() {
    const $mapGeoJSON = useStore(mapGeoJSON);

    // Subscribe to questions with low priority so urgent UI updates (e.g.
    // QuestionsPanel showing a newly submitted question) are processed first.
    // The map overlay catches up in the next transition render.
    const [mapQuestions, setMapQuestions] = useState<Questions>(
        () => questions.get() as Questions,
    );
    useEffect(() => {
        return questions.subscribe((q) => {
            startTransition(() => setMapQuestions(q as Questions));
        });
    }, []);

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
    const [tentaclesRegions, setTentaclesRegions] = useState<TentaclesRegion[]>(
        [],
    );
    const [matchingRegions, setMatchingRegions] = useState<MatchingRegion[]>(
        [],
    );
    const [measuringRegions, setMeasuringRegions] = useState<MeasuringRegion[]>(
        [],
    );
    const [isComputingLayers, setIsComputingLayers] = useState(false);

    useEffect(() => {
        if (!$mapGeoJSON) {
            // Zone cleared or loading — wipe all overlays so stale question
            // regions don't persist on the map.
            setEliminationMask(null);
            setZoneBoundary(null);
            setRadiusRegions([]);
            setThermometerRegions([]);
            setTentaclesRegions([]);
            setMatchingRegions([]);
            setMeasuringRegions([]);
            return;
        }
        let cancelled = false;
        const isCancelled = () => cancelled;

        // Debounce: wait 300 ms after the last change before starting heavy
        // computation. Prevents thrashing while the user is editing a question
        // (e.g. dragging a radius slider or typing coordinates).
        const debounceTimer = setTimeout(() => {
            if (cancelled) return; // guard against cleanup racing the timer

            // Show a warning snackbar if rendering takes longer than 10 s.
            const slowTimer = setTimeout(() => {
                if (!cancelled) {
                    toast.warn("Map rendering is taking a while…");
                    Sentry.captureMessage("Map render slow (>10 s)", "warning");
                }
            }, 10000);

            // Yields the JS thread for one macrotask, allowing touch events (e.g.
            // opening the location-type dropdown) to be processed between heavy steps.
            const tick = () => new Promise<void>((r) => setTimeout(r, 0));

            const run = async () => {
                setIsComputingLayers(true);
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
                    const tU = Date.now();
                    const zoneRaw: Feature<Polygon | MultiPolygon> | null =
                        features.length === 1
                            ? features[0]
                            : turf.union(turf.featureCollection(features));
                    if (!zoneRaw) return;
                    console.log(`[eliminationMask] union: ${Date.now()-tU}ms coords=${turf.coordAll(zoneRaw).length}`);

                    const tT = Date.now();
                    const zoneOrNull = trunc(zoneRaw);
                    console.log(`[eliminationMask] trunc: ${Date.now()-tT}ms coords=${turf.coordAll(zoneOrNull).length}`);

                    setZoneBoundary(zoneOrNull);
                    const tD = Date.now();
                    const mask = turf.difference(
                        turf.featureCollection([world, zoneOrNull]),
                    );
                    console.log(`[eliminationMask] difference (world-zone): ${Date.now()-tD}ms`);
                    setEliminationMask(mask ? trunc(mask) : null);

                    const radius = await computeRadiusRegions(
                        mapQuestions,
                        zoneOrNull,
                        isCancelled,
                    );
                    if (radius === null) return;
                    setRadiusRegions(radius);

                    const thermometer = await computeThermometerRegions(
                        mapQuestions,
                        zoneOrNull,
                        isCancelled,
                    );
                    if (thermometer === null) return;
                    setThermometerRegions(thermometer);

                    if (mapQuestions.some((q) => q.id === "tentacles"))
                        toast.loading("Computing tentacles regions…");
                    const tentacles = await computeTentaclesRegions(
                        mapQuestions,
                        zoneOrNull,
                        isCancelled,
                    );
                    if (tentacles === null) return;
                    setTentaclesRegions(tentacles);

                    if (mapQuestions.some((q) => q.id === "matching"))
                        toast.loading("Computing matching regions…");
                    const matching = await computeMatchingRegions(
                        mapQuestions,
                        zoneOrNull,
                        isCancelled,
                    );
                    if (matching === null) return;
                    setMatchingRegions(matching);

                    if (mapQuestions.some((q) => q.id === "measuring"))
                        toast.loading("Computing measuring regions…");
                    const measuring = await computeMeasuringRegions(
                        mapQuestions,
                        zoneOrNull,
                        isCancelled,
                    );
                    if (measuring === null) return;
                    setMeasuringRegions(measuring);
                } catch (e) {
                    Sentry.captureException(e, {
                        tags: { location: "useEliminationMask" },
                    });
                } finally {
                    clearTimeout(slowTimer);
                    if (!cancelled) setIsComputingLayers(false);
                }
            };

            run();
        }, 300); // end debounce

        return () => {
            cancelled = true;
            clearTimeout(debounceTimer);
        };
    }, [$mapGeoJSON, mapQuestions]);

    return {
        eliminationMask,
        zoneBoundary,
        radiusRegions,
        thermometerRegions,
        tentaclesRegions,
        matchingRegions,
        measuringRegions,
        isComputingLayers,
    };
}

// ── Coordinate precision helper ───────────────────────────────────────────────
//
// Turf outputs 15-17 decimal places by default. 6 dp ≈ 11 cm, which is far
// more than sufficient for any game-board zoom level and reduces GeoJSON size
// by ~50%, speeding up serialisation and MapLibre vertex upload.
function trunc<T extends Feature>(f: T): T {
    return turf.truncate(f, { precision: 6, mutate: true }) as T;
}

// ── Per-question region computers ────────────────────────────────────────────
//
// Sync helpers return the regions array directly.
// Async helpers return null if cancelled (caller must return early on null).

async function computeRadiusRegions(
    $questions: Questions,
    zone: Feature<Polygon | MultiPolygon>,
    isCancelled: () => boolean,
): Promise<RadiusRegion[] | null> {
    const regions: RadiusRegion[] = [];
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    for (const q of $questions) {
        if (q.id !== "radius") continue;
        await tick();
        if (isCancelled()) return null;
        const { lat, lng, radius, unit, within } = q.data;
        const circle = turf.circle([lng, lat], radius, {
            units: unit,
            steps: 64,
        });
        const eliminated = within
            ? // within=true: valid area is inside circle → eliminate the ring outside
              turf.difference(turf.featureCollection([zone, circle]))
            : // within=false: valid area is outside circle → eliminate the circle
              turf.intersect(turf.featureCollection([zone, circle]));
        if (eliminated) regions.push({ key: q.key, region: trunc(eliminated) });
    }
    return regions;
}

async function computeThermometerRegions(
    $questions: Questions,
    zone: Feature<Polygon | MultiPolygon>,
    isCancelled: () => boolean,
): Promise<ThermometerRegion[] | null> {
    const regions: ThermometerRegion[] = [];
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    for (const q of $questions) {
        if (q.id !== "thermometer") continue;
        await tick();
        if (isCancelled()) return null;
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
                turf.destination(mid, d, abBearing - 90, {
                    units: "kilometers",
                }).geometry.coordinates as [number, number],
            );
        }
        bisectorCoords.push(mid.geometry.coordinates as [number, number]);
        for (let d = step; d <= reach; d += step) {
            bisectorCoords.push(
                turf.destination(mid, d, abBearing + 90, {
                    units: "kilometers",
                }).geometry.coordinates as [number, number],
            );
        }

        // Close the half-plane on the eliminated side by adding two far
        // corners behind the eliminated point, then closing to the start.
        // warmer=true → eliminated side is A (abBearing+180 direction from mid)
        // warmer=false → eliminated side is B (abBearing direction)
        const validBearing = warmer ? abBearing + 180 : abBearing;
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

        const halfPlane = turf.polygon([
            [...bisectorCoords, farRight, farLeft, bisectorCoords[0]],
        ]);

        const clipped = turf.intersect(
            turf.featureCollection([zone, halfPlane]),
        );
        if (clipped) regions.push({ key: q.key, region: trunc(clipped) });
    }
    return regions;
}

/**
 * Returns null if cancelled mid-fetch (caller should return early).
 */
async function computeTentaclesRegions(
    $questions: Questions,
    zone: Feature<Polygon | MultiPolygon>,
    isCancelled: () => boolean,
): Promise<TentaclesRegion[] | null> {
    const regions: TentaclesRegion[] = [];
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));

    for (const q of $questions) {
        if (q.id !== "tentacles") continue;
        if (q.data.locationType === "custom") continue;

        const circle = turf.circle([q.data.lng, q.data.lat], q.data.radius, {
            units: q.data.unit,
            steps: 64,
        });

        // Always fetch POIs so dots are visible in all modes.
        let poiFeatures: Feature<Point>[] = [];
        try {
            const pts = await fetchTentacleLocations(q.data as any);
            if (isCancelled()) return null;
            poiFeatures = pts.features as Feature<Point>[];
        } catch (e) {
            Sentry.captureException(e, { tags: { question_type: "tentacles" } });
            if (isCancelled()) return null;
        }

        // Yield after the fetch so touch events can be processed before the
        // synchronous Voronoi / turf work below runs.
        await tick();
        if (isCancelled()) return null;

        if (!q.data.within) {
            // Outside mode: hider is NOT in the circle → shade the circle.
            const eliminated = turf.intersect(
                turf.featureCollection([zone, circle]),
            );
            if (eliminated) {
                regions.push({
                    key: q.key,
                    region: trunc(eliminated),
                    location: null,
                    pois: poiFeatures,
                });
            }
            continue;
        }

        if (q.data.location === false) {
            // Inside mode, no POI selected → shade outside the circle.
            const eliminated = turf.difference(
                turf.featureCollection([zone, circle]),
            );
            if (eliminated) {
                regions.push({
                    key: q.key,
                    region: trunc(eliminated),
                    location: null,
                    pois: poiFeatures,
                });
            }
            continue;
        }

        // Inside mode, POI selected → shade everything except the
        // selected POI's Voronoi cell clipped to the circle.
        if (poiFeatures.length === 0) continue;
        try {
            const circleBbox = turf.bbox(
                turf.circle([q.data.lng, q.data.lat], q.data.radius * 3, {
                    units: q.data.unit,
                }),
            ) as [number, number, number, number];
            const voronoi = turf.voronoi(turf.featureCollection(poiFeatures), {
                bbox: circleBbox,
            });
            if (!voronoi) continue;

            const selectedName = (q.data.location as any).properties.name;
            const selectedPt = poiFeatures.find(
                (f: any) => f.properties.name === selectedName,
            );
            if (!selectedPt) continue;

            const cell = voronoi.features.find(
                (f: any) => f && turf.booleanPointInPolygon(selectedPt, f),
            );
            if (!cell) continue;

            // Valid area = selected Voronoi cell ∩ circle (clipped to zone).
            const validArea = turf.intersect(
                turf.featureCollection([zone, cell, circle]),
            );
            if (!validArea) continue;

            // Eliminated = zone minus valid area.
            const eliminated = turf.difference(
                turf.featureCollection([zone, validArea]),
            );
            if (eliminated) {
                regions.push({
                    key: q.key,
                    region: trunc(eliminated),
                    location: q.data.location as unknown as Feature<Point>,
                    pois: poiFeatures,
                });
            }
        } catch {
            // Voronoi error — skip silently
        }
    }

    return regions;
}

/**
 * Returns null if cancelled mid-fetch (caller should return early).
 */
async function computeMatchingRegions(
    $questions: Questions,
    zone: Feature<Polygon | MultiPolygon>,
    isCancelled: () => boolean,
): Promise<MatchingRegion[] | null> {
    const regions: MatchingRegion[] = [];
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));

    for (const q of $questions) {
        if (q.id !== "matching") continue;
        try {
            const result = await resolveMatchingBoundary(
                q as Extract<Question, { id: "matching" }>,
                zone,
            );
            if (isCancelled()) return null;
            if (!result.boundary) continue;

            await tick();
            if (isCancelled()) return null;

            // same=true: valid zone is the matching boundary → eliminate what's outside
            // same=false: valid zone excludes the matching boundary → eliminate what's inside
            const eliminated = q.data.same
                ? turf.difference(
                      turf.featureCollection([zone, result.boundary]),
                  )
                : turf.intersect(
                      turf.featureCollection([zone, result.boundary]),
                  );

            if (eliminated)
                regions.push({
                    key: q.key,
                    region: trunc(eliminated),
                    pois: result.pois,
                    circles: result.circles,
                });
        } catch (e) {
            Sentry.captureException(e, { tags: { question_type: "measuring" } });
        }
    }

    return regions;
}

/**
 * Returns null if cancelled mid-fetch (caller should return early).
 */
async function computeMeasuringRegions(
    $questions: Questions,
    zone: Feature<Polygon | MultiPolygon>,
    isCancelled: () => boolean,
): Promise<MeasuringRegion[] | null> {
    const regions: MeasuringRegion[] = [];
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));

    for (const q of $questions) {
        if (q.id !== "measuring") continue;
        try {
            const result = await resolveMeasuringBuffer(
                q as Extract<Question, { id: "measuring" }>,
                zone,
            );
            if (isCancelled()) return null;
            if (!result) continue;

            await tick();
            if (isCancelled()) return null;

            const { buffer } = result;

            // hiderCloser=true: valid zone is INSIDE buffer → eliminate outer ring
            // hiderCloser=false: valid zone is OUTSIDE buffer → eliminate inner circle
            const eliminated = q.data.hiderCloser
                ? turf.difference(turf.featureCollection([zone, buffer]))
                : turf.intersect(turf.featureCollection([zone, buffer]));

            if (eliminated)
                regions.push({
                    key: q.key,
                    region: trunc(eliminated),
                    pois: result.pois,
                    circles: result.circles,
                });
        } catch (e) {
            Sentry.captureException(e, { tags: { question_type: "matching" } });
        }
    }

    return regions;
}

// ── Shared POI bbox / zone-filter helpers ────────────────────────────────

/**
 * Returns a bbox for an Overpass POI query centred on a single point,
 * clamped to the game zone.
 */
function poiBbox(
    lng: number,
    lat: number,
    searchRadius: number | null | undefined,
    zone: Feature<Polygon | MultiPolygon>,
): [number, number, number, number] {
    const zoneBbox = turf.bbox(zone) as [number, number, number, number];
    const radiusKm = searchRadius === null ? null : (searchRadius ?? 100);
    if (radiusKm === null) return zoneBbox;
    const circleBbox = turf.bbox(
        turf.circle([lng, lat], radiusKm, { units: "kilometers" }),
    ) as [number, number, number, number];
    return [
        Math.max(circleBbox[0], zoneBbox[0]),
        Math.max(circleBbox[1], zoneBbox[1]),
        Math.min(circleBbox[2], zoneBbox[2]),
        Math.min(circleBbox[3], zoneBbox[3]),
    ];
}

/**
 * Removes POIs from `candidates` whose coordinates already appear in `existing`
 * (rounded to 4 dp, ~11 m precision). Used to deduplicate additional-region
 * fetches against the seeker-region fetch.
 */
/** Removes POI features that lie outside the game zone polygon. */
function filterPoisByZone(
    pois: Feature<Point>[],
    zone: Feature<Polygon | MultiPolygon>,
): Feature<Point>[] {
    return pois.filter((f) => {
        try {
            return turf.booleanPointInPolygon(f, zone);
        } catch {
            return false;
        }
    });
}

// ── resolveMatchingBoundary ───────────────────────────────────────────────

async function resolveMatchingBoundary(
    q: Extract<Question, { id: "matching" }>,
    zoneOrNull: Feature<Polygon | MultiPolygon>,
): Promise<{
    boundary: Feature<Polygon | MultiPolygon> | null;
    pois: Feature<Point>[];
}> {
    const type = q.data.type;
    switch (type) {
        case "zone": {
            const boundary = await fetchAdminBoundary(
                q.data.lat,
                q.data.lng,
                (q.data as any).cat?.adminLevel ?? 4,
            );
            return { boundary, pois: [] };
        }
        case "airport": {
            const pts = await fetchAirports();
            return {
                boundary: findVoronoiCell(q.data.lng, q.data.lat, pts),
                pois: [],
            };
        }
        case "major-city": {
            const pts = await fetchMajorCities();
            return {
                boundary: findVoronoiCell(q.data.lng, q.data.lat, pts),
                pois: [],
            };
        }
        case "aquarium":
        case "zoo":
        case "theme_park":
        case "peak":
        case "museum":
        case "hospital":
        case "cinema":
        case "library":
        case "golf_course":
        case "consulate":
        case "park": {
            const bbox = poiBbox(
                q.data.lng,
                q.data.lat,
                (q.data as any).poiSearchRadius,
                zoneOrNull,
            );
            const pts = await fetchMatchingPOIs(type, bbox);
            const inZone = filterPoisByZone(
                pts.features as Feature<Point>[],
                zoneOrNull,
            );
            return {
                boundary: findVoronoiCell(
                    q.data.lng,
                    q.data.lat,
                    turf.featureCollection(inZone),
                ),
                pois: inZone,
            };
        }
        default:
            // Station types and other subtypes not yet implemented on mobile
            return { boundary: null, pois: [] };
    }
}

// ── resolveMeasuringBuffer ────────────────────────────────────────────────────

/**
 * Builds a buffer polygon that is the union of per-POI circles, where each
 * circle is centred on a POI with radius = seeker's distance to that POI.
 *
 * "Closer" valid zone  = inside the union (hider is closer to some POI than seeker is)
 * "Farther" valid zone = outside the union (hider is farther from every POI than seeker is)
 */
// Max POIs passed to turf.union — distant ones produce huge circles covering the
// entire zone anyway, so keeping only the nearest N is good enough for the game.
const MAX_UNION_POIS = 50;

function buildPOIUnionBuffer(
    lng: number,
    lat: number,
    pois: Feature<Point>[],
    label: string,
): {
    union: Feature<Polygon | MultiPolygon>;
    circles: Feature<Polygon>[];
} | null {
    if (pois.length === 0) return null;

    const seekerPt = turf.point([lng, lat]);

    const selected = pois
        .map((poi) => ({
            poi,
            seekerDist: turf.distance(seekerPt, poi, { units: "kilometers" }),
        }))
        .sort((a, b) => a.seekerDist - b.seekerDist)
        .slice(0, MAX_UNION_POIS);
    if (selected.length === 0) return null;

    // Radius = seeker → nearest POI across all selected POIs.
    const radiusKm = Math.min(...selected.map(({ seekerDist }) => seekerDist));
    if (radiusKm <= 0) return null;

    const t0 = Date.now();
    const circles = selected.map(({ poi }) =>
        trunc(
            turf.circle(
                poi.geometry.coordinates as [number, number],
                radiusKm,
                {
                    units: "kilometers",
                    steps: 16,
                },
            ),
        ),
    );
    if (circles.length === 1) return { union: circles[0], circles };
    const t1 = Date.now();
    const union = turf.union(turf.featureCollection(circles));
    if (!union) return null;
    return { union: trunc(union), circles };
}

async function resolveMeasuringBuffer(
    q: Extract<Question, { id: "measuring" }>,
    zoneOrNull: Feature<Polygon | MultiPolygon>,
): Promise<{
    buffer: Feature<Polygon | MultiPolygon>;
    pois: Feature<Point>[];
    circles: Feature<Polygon>[];
} | null> {
    const { lat, lng, type } = q.data;
    const searchRadius = (q.data as any).poiSearchRadius as
        | number
        | null
        | undefined;
    // Search center — falls back to seeker when not explicitly set.
    const searchLat =
        ((q.data as any).poiSearchLat as number | undefined) ?? lat;
    const searchLng =
        ((q.data as any).poiSearchLng as number | undefined) ?? lng;

    switch (type) {
        case "coastline": {
            const coastline = await fetchCoastline();

            // Use a ±5° rough pad around the seeker to find the nearest coast
            // distance, reducing 1400+ global features to ~10 for the search.
            const ROUGH_PAD = 5;
            const seekerCandidates = coastline.features.filter((f) => {
                const [w, s, e, n] = turf.bbox(f);
                return (
                    w <= lng + ROUGH_PAD &&
                    e >= lng - ROUGH_PAD &&
                    s <= lat + ROUGH_PAD &&
                    n >= lat - ROUGH_PAD
                );
            });
            if (!seekerCandidates.length) return null;

            // Find the seeker's distance to the nearest coastline segment.
            const target = turf.point([lng, lat]);
            let bestDist = Infinity;
            for (const f of seekerCandidates) {
                try {
                    const np = turf.nearestPointOnLine(
                        f as Feature<LineString>,
                        target,
                        { units: "kilometers" },
                    );
                    const d = np.properties.dist ?? Infinity;
                    if (d < bestDist) bestDist = d;
                } catch {
                    // skip degenerate segments
                }
            }
            if (!isFinite(bestDist)) return null;

            // Buffer all coastline features that overlap the game zone — not just
            // the strip nearest the seeker — so the result covers the whole zone.
            const [zw, zs, ze, zn] = turf.bbox(zoneOrNull);
            const zoneFeatures = coastline.features.filter((f) => {
                const [w, s, e, n] = turf.bbox(f);
                return w <= ze && e >= zw && s <= zn && n >= zs;
            });
            if (!zoneFeatures.length) return null;

            const simplified = turf.simplify(
                turf.featureCollection(zoneFeatures),
                { tolerance: 0.01, highQuality: false },
            );

            const bufferFC = turf.buffer(simplified, bestDist, {
                units: "kilometers",
            });
            if (!bufferFC?.features.length) return null;

            const buffer =
                bufferFC.features.length === 1
                    ? (bufferFC.features[0] as Feature<Polygon | MultiPolygon>)
                    : (turf.union(
                          turf.featureCollection(bufferFC.features),
                      ) as Feature<Polygon | MultiPolygon> | null);
            if (!buffer) return null;

            return {
                buffer: trunc(buffer),
                pois: [],
                circles: [],
            };
        }

        case "airport": {
            const bbox = poiBbox(
                searchLng,
                searchLat,
                searchRadius,
                zoneOrNull,
            );
            const pts = (await fetchMeasuringAirports(bbox))
                .features as Feature<Point>[];
            const result = buildPOIUnionBuffer(lng, lat, pts, "airport");
            if (!result) return null;
            return { buffer: result.union, circles: result.circles, pois: pts };
        }

        case "city": {
            const bbox = poiBbox(
                searchLng,
                searchLat,
                searchRadius,
                zoneOrNull,
            );
            const pts = (await fetchCities(bbox)).features as Feature<Point>[];
            const result = buildPOIUnionBuffer(lng, lat, pts, "city");
            if (!result) return null;
            return { buffer: result.union, circles: result.circles, pois: pts };
        }

        case "highspeed-measure-shinkansen": {
            const lines = await fetchHighSpeedRail();
            const nearest = nearestPointOnLines(lng, lat, lines);
            if (!nearest) return null;
            const bufferFC = turf.buffer(lines, nearest.distanceKm, {
                units: "kilometers",
            });
            const buffer = bufferFC?.features[0] as
                | Feature<Polygon | MultiPolygon>
                | undefined;
            return buffer
                ? { buffer: trunc(buffer), pois: [], circles: [] }
                : null;
        }

        case "admin-border-2":
        case "admin-border-3":
        case "admin-border-4":
        case "admin-border-5":
        case "admin-border-6":
        case "admin-border-7":
        case "admin-border-8":
        case "admin-border-9":
        case "admin-border-10":
        case "admin-border-11": {
            const adminLevel = parseInt(type.split("-")[2], 10);
            const tTotal = Date.now();

            // 1. Fetch over the full game zone bbox so distant borders (e.g. US-Mexico
            //    from SF) are included. Fall back to a 500 km radius if no zone.
            const fetchBbox = zoneOrNull
                ? (turf.bbox(zoneOrNull) as [number, number, number, number])
                : poiBbox(lng, lat, 500, null);
            console.log(`[adminMask] level=${adminLevel} fetchBbox=[${fetchBbox.map(n => n.toFixed(2)).join(",")}]`);
            const t1 = Date.now();
            const allLines = await fetchAdminBoundaries(adminLevel, fetchBbox);
            console.log(`[adminMask] level=${adminLevel} fetch done: ${allLines.features.length} lines in ${Date.now() - t1} ms`);
            if (!allLines.features.length) return null;

            // 2. Find seeker's distance to the nearest border segment.
            const t2 = Date.now();
            const nearest = nearestPointOnLines(lng, lat, allLines);
            if (!nearest) return null;
            const D = nearest.distanceKm;
            console.log(`[adminMask] level=${adminLevel} nearestPointOnLines: D=${D.toFixed(1)} km in ${Date.now() - t2} ms`);

            // 3. Filter: keep only lines whose bbox overlaps the zone expanded by D.
            //    Lines outside this padded zone can't contribute to the mask within the zone.
            const [zw, zs, ze, zn] = turf.bbox(zoneOrNull);
            const degLat = D / 111;
            const degLng = D / (111 * Math.cos((lat * Math.PI) / 180));
            const withinReach = allLines.features.filter((f) => {
                const [w, s, e, n] = turf.bbox(f);
                return (
                    w <= ze + degLng &&
                    e >= zw - degLng &&
                    s <= zn + degLat &&
                    n >= zs - degLat
                );
            });
            console.log(`[adminMask] level=${adminLevel} zone filter: ${withinReach.length}/${allLines.features.length} lines kept`);
            if (!withinReach.length) return null;

            // 4. Sort by centroid distance to seeker, cap at MAX_ADMIN_LINES to bound
            //    the buffer + union work for fine-grained levels (8–11).
            const MAX_ADMIN_LINES = 100;
            const toProcess = withinReach
                .map((f) => ({
                    f,
                    d: turf.distance(
                        [lng, lat],
                        turf.centroid(f),
                        { units: "kilometers" },
                    ),
                }))
                .sort((a, b) => a.d - b.d)
                .slice(0, MAX_ADMIN_LINES)
                .map(({ f }) => f);
            console.log(`[adminMask] level=${adminLevel} after sort+cap: ${toProcess.length} lines`);

            // 5. Simplify to reduce vertex count before buffering.
            const t5 = Date.now();
            const simplified = turf.simplify(
                turf.featureCollection(toProcess),
                { tolerance: 0.01, highQuality: false },
            );
            console.log(`[adminMask] level=${adminLevel} simplify done in ${Date.now() - t5} ms`);

            // 6. Buffer + union.
            const t6 = Date.now();
            const bufferFC = turf.buffer(simplified, D, { units: "kilometers" });
            console.log(`[adminMask] level=${adminLevel} buffer done in ${Date.now() - t6} ms`);
            if (!bufferFC?.features.length) return null;
            const t7 = Date.now();
            const buffer =
                bufferFC.features.length === 1
                    ? (bufferFC.features[0] as Feature<Polygon | MultiPolygon>)
                    : (turf.union(
                          turf.featureCollection(bufferFC.features),
                      ) as Feature<Polygon | MultiPolygon> | null);
            console.log(`[adminMask] level=${adminLevel} union(${bufferFC.features.length} polys) done in ${Date.now() - t7} ms`);
            if (!buffer) return null;

            // 7. Perimeter circle centred on the seeker at radius D — rendered on the
            //    map as the reference distance ring (same as POI buffer circles).
            const perimeterCircle = trunc(
                turf.circle([lng, lat], D, { steps: 64, units: "kilometers" }),
            );

            console.log(`[adminMask] level=${adminLevel} total ${Date.now() - tTotal} ms`);
            return { buffer: trunc(buffer), pois: [], circles: [perimeterCircle] };
        }

        case "aquarium":
        case "zoo":
        case "theme_park":
        case "peak":
        case "museum":
        case "hospital":
        case "cinema":
        case "library":
        case "golf_course":
        case "consulate":
        case "park":
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full": {
            const bbox = poiBbox(
                searchLng,
                searchLat,
                searchRadius,
                zoneOrNull,
            );
            const pts = filterPoisByZone(
                (await fetchMeasuringPOIs(type, bbox))
                    .features as Feature<Point>[],
                zoneOrNull,
            );
            const result = buildPOIUnionBuffer(lng, lat, pts, type);
            if (!result) return null;
            return { buffer: result.union, circles: result.circles, pois: pts };
        }

        // Phase 3: mcdonalds, seven11, rail-measure — not yet implemented on mobile
        default:
            return null;
    }
}
