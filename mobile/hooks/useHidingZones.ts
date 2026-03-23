import * as Sentry from "@sentry/react-native";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import { useEffect, useRef, useState } from "react";

import { OVERPASS_API } from "../../src/maps/api/constants";
import { toast } from "../lib/notifications";
import {
    displayHidingZones,
    displayHidingZonesOptions,
    hidingRadius,
    hidingRadiusUnits,
    mergeDuplicates,
} from "../lib/context";
import { deleteCached, getCached, setCached } from "../lib/storage";

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_STATIONS = 500;
const HIDING_CACHE_MAX = 20;
const HIDING_LRU_KEY = "hiding:__lru__";

// ── LRU cache helpers ──────────────────────────────────────────────────────

type CachedResult = {
    circles: FeatureCollection<Polygon>;
    mask: Feature<Polygon | MultiPolygon> | null;
    pois: Feature<Point>[];
};

function buildBboxHash(bbox: number[]): string {
    return `${bbox[0].toFixed(2)},${bbox[1].toFixed(2)},${bbox[2].toFixed(2)},${bbox[3].toFixed(2)}`;
}

function buildStoreKey(
    tags: string[],
    bboxHash: string,
    radius: number,
    units: string,
    merged: boolean,
): string {
    return `hiding:${[...tags].sort().join("|")}:${bboxHash}:${radius.toFixed(3)}:${units}:${merged ? "1" : "0"}`;
}

function lruRead(): string[] {
    const raw = getCached(HIDING_LRU_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
}

function lruTouch(list: string[], key: string): string[] {
    const idx = list.indexOf(key);
    if (idx !== -1) list.splice(idx, 1);
    list.push(key); // most-recently-used at end
    return list;
}

function persistentGet(key: string): CachedResult | null {
    const raw = getCached(key);
    if (!raw) return null;
    setCached(HIDING_LRU_KEY, JSON.stringify(lruTouch(lruRead(), key)));
    return JSON.parse(raw) as CachedResult;
}

function persistentSet(key: string, result: CachedResult): void {
    setCached(key, JSON.stringify(result));
    const lru = lruTouch(lruRead(), key);
    while (lru.length > HIDING_CACHE_MAX) {
        deleteCached(lru.shift()!);
    }
    setCached(HIDING_LRU_KEY, JSON.stringify(lru));
}

// ── Overpass fetch ─────────────────────────────────────────────────────────

async function fetchStopsForTag(
    tag: string,
    bbox: number[], // turf bbox: [west, south, east, north]
): Promise<Feature<Point>[]> {
    const [west, south, east, north] = bbox;
    // Overpass format: (south, west, north, east)
    const query = `[out:json][timeout:25];node${tag}(${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)});out body;`;
    const url = `${OVERPASS_API}?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) {
        Sentry.captureMessage(
            `Overpass hiding zones ${tag} HTTP ${res.status}`,
            "warning",
        );
        return [];
    }
    const data = (await res.json()) as { elements: any[]; remark?: string };
    if (data.remark?.includes("runtime error") || data.remark?.includes("timed out")) {
        Sentry.captureMessage(`Overpass hiding zones ${tag} timed out: ${data.remark}`, "warning");
        console.warn(`[hidingZones] Overpass timeout for ${tag}:`, data.remark);
        return [];
    }
    const features: Feature<Point>[] = [];
    for (const el of data.elements) {
        if (el.lat == null || el.lon == null) continue;
        features.push(turf.point([el.lon, el.lat]));
    }
    return features;
}

// ── Deduplication ──────────────────────────────────────────────────────────

/**
 * O(n) grid-based deduplication. Snaps each stop to a grid cell of ~30 m
 * and keeps only one stop per cell. Much faster than the O(n²) distance
 * approach for dense datasets (e.g. 700+ bus stops).
 *
 * 30 m ≈ 0.00027° latitude; we use 0.0003° (~33 m) for a round number.
 */
const DEDUP_GRID_DEG = 0.0003;

function deduplicateWithinGrid(stops: Feature<Point>[]): Feature<Point>[] {
    const seen = new Set<string>();
    const result: Feature<Point>[] = [];
    for (const stop of stops) {
        const [lng, lat] = stop.geometry.coordinates as [number, number];
        const cellLng = Math.round(lng / DEDUP_GRID_DEG);
        const cellLat = Math.round(lat / DEDUP_GRID_DEG);
        const key = `${cellLng},${cellLat}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(stop);
        }
    }
    return result;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetches transit stops within the game zone boundary and generates hiding
 * zone circles around each stop.
 *
 * Returns:
 *  - `hidingZoneCircles`: all circles (or their union) as a FeatureCollection
 *  - `hidingZonePois`:    raw stop points for dot rendering
 *  - `isLoading`:         true while fetching / computing
 */
export function useHidingZones({
    zoneBoundary,
}: {
    zoneBoundary: Feature<Polygon | MultiPolygon> | null;
}): {
    hidingZoneCircles: FeatureCollection<Polygon> | null;
    hidingZoneMask: Feature<Polygon | MultiPolygon> | null;
    hidingZonePois: Feature<Point>[];
    isLoading: boolean;
} {
    const $displayHidingZones = useStore(displayHidingZones);
    const $displayHidingZonesOptions = useStore(displayHidingZonesOptions);
    const $hidingRadius = useStore(hidingRadius);
    const $hidingRadiusUnits = useStore(hidingRadiusUnits);
    const $mergeDuplicates = useStore(mergeDuplicates);

    const [hidingZoneCircles, setHidingZoneCircles] =
        useState<FeatureCollection<Polygon> | null>(null);
    const [hidingZoneMask, setHidingZoneMask] =
        useState<Feature<Polygon | MultiPolygon> | null>(null);
    const [hidingZonePois, setHidingZonePois] = useState<Feature<Point>[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (
            !$displayHidingZones ||
            !zoneBoundary ||
            $displayHidingZonesOptions.length === 0
        ) {
            setHidingZoneCircles(null);
            setHidingZoneMask(null);
            setHidingZonePois([]);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        const isCancelled = () => cancelled;

        const debounceTimer = setTimeout(() => {
            if (cancelled) return;

            const bbox = turf.bbox(zoneBoundary); // [west, south, east, north]
            const bboxKey = buildBboxHash(bbox);
            const storeKey = buildStoreKey(
                $displayHidingZonesOptions,
                bboxKey,
                $hidingRadius,
                $hidingRadiusUnits,
                $mergeDuplicates,
            );

            // Synchronous cache hit — no loading state needed
            const cached = persistentGet(storeKey);
            if (cached) {
                if (!isCancelled()) {
                    setHidingZoneCircles(cached.circles);
                    setHidingZoneMask(cached.mask);
                    setHidingZonePois(cached.pois);
                    setIsLoading(false);
                }
                return;
            }

            setIsLoading(true);
            toast.loading("Fetching hiding zones…");

            const slowTimer = setTimeout(() => {
                if (!isCancelled()) {
                    Sentry.captureMessage(
                        "Hiding zones computation slow (>10 s)",
                        "warning",
                    );
                }
            }, 10000);

            // Yields the JS thread so touch events are processed between steps.
            const tick = () => new Promise<void>((r) => setTimeout(r, 0));

            const run = async () => {
                try {
                    // 1. Fetch stops for all selected transit types
                    const allStops: Feature<Point>[] = [];
                    for (const tag of $displayHidingZonesOptions) {
                        if (isCancelled()) return;
                        const stops = await fetchStopsForTag(tag, bbox);
                        allStops.push(...stops);
                        await tick();
                    }

                    if (isCancelled()) return;

                    // 2. Grid-based dedup (~30 m cell); cap at MAX_STATIONS
                    const deduped = deduplicateWithinGrid(allStops);
                    const capped = deduped.slice(0, MAX_STATIONS);

                    // 3. Generate circles, clipping to zone boundary only when needed.
                    //
                    // Clipping is expensive because the zone boundary can have thousands
                    // of vertices (municipal polygons are detailed). We avoid it in two ways:
                    //   a) Simplify the boundary once before the loop (coarse enough to be
                    //      fast, fine enough that edge clips look correct at map zoom).
                    //   b) When not merging, skip clipping entirely — individual circle
                    //      outlines slightly outside the zone are visually harmless, and
                    //      only the mask (merge path) actually requires accurate clipping.
                    const simplifiedZone = $mergeDuplicates
                        ? (turf.simplify(
                              JSON.parse(JSON.stringify(zoneBoundary)) as typeof zoneBoundary,
                              { tolerance: 0.001, highQuality: false },
                          ) as typeof zoneBoundary)
                        : null;

                    const circles: Feature<Polygon>[] = [];
                    for (let i = 0; i < capped.length; i++) {
                        if (isCancelled()) return;
                        const stop = capped[i];
                        const circle = turf.circle(
                            stop.geometry.coordinates as [number, number],
                            $hidingRadius,
                            {
                                steps: 16, // 16 is visually indistinguishable from 32 at map zoom, but 2× fewer vertices
                                units: $hidingRadiusUnits as turf.Units,
                            },
                        );
                        if (simplifiedZone) {
                            // Merging: clip each circle so the union/mask is accurate at zone edges.
                            const clipped = turf.intersect(
                                turf.featureCollection([circle, simplifiedZone]),
                            );
                            if (clipped) circles.push(clipped as Feature<Polygon>);
                        } else {
                            // Not merging: use raw circles (no clip needed for outline-only display).
                            circles.push(circle);
                        }
                        if (i % 50 === 0) await tick();
                    }

                    if (isCancelled()) return;

                    if (circles.length === 0) {
                        clearTimeout(slowTimer);
                        if (!isCancelled()) {
                            setHidingZoneCircles(
                                turf.featureCollection<Polygon>([]),
                            );
                            setHidingZoneMask(null);
                            setHidingZonePois(capped);
                            setIsLoading(false);
                        }
                        return;
                    }

                    let resultCircles: FeatureCollection<Polygon>;
                    let mask: Feature<Polygon | MultiPolygon> | null = null;

                    if ($mergeDuplicates) {
                        // 4a. Sequential pairwise union — only needed when merging.
                        //     Pairwise is more robust than turf.union(featureCollection(N))
                        //     for large / complex inputs.
                        let unioned: Feature<Polygon | MultiPolygon> = circles[0];
                        for (let i = 1; i < circles.length; i++) {
                            if (isCancelled()) return;
                            const next = turf.union(
                                turf.featureCollection([unioned, circles[i]]),
                            );
                            if (next) unioned = next;
                            if (i % 20 === 0) await tick();
                        }

                        if (isCancelled()) return;

                        resultCircles = turf.featureCollection([
                            unioned as Feature<Polygon>,
                        ]);

                        // 5. Mask = zone boundary minus union of all circles.
                        mask =
                            turf.difference(
                                turf.featureCollection([zoneBoundary, unioned]),
                            ) ?? null;
                    } else {
                        // 4b. No merge — skip union entirely (huge speedup for dense areas).
                        resultCircles = turf.featureCollection(circles);
                    }

                    clearTimeout(slowTimer);
                    if (isCancelled()) return;

                    const resultObj: CachedResult = {
                        circles: resultCircles,
                        mask,
                        pois: capped,
                    };
                    persistentSet(storeKey, resultObj);
                    setHidingZoneCircles(resultCircles);
                    setHidingZoneMask(mask);
                    setHidingZonePois(capped);
                    toast.success(`Hiding zones loaded (${capped.length} stops)`);
                } catch (err) {
                    clearTimeout(slowTimer);
                    if (!isCancelled()) {
                        Sentry.captureException(err, {
                            tags: { location: "useHidingZones" },
                        });
                        setHidingZoneCircles(null);
                        setHidingZoneMask(null);
                        toast.error("Could not load hiding zones");
                    }
                } finally {
                    if (!isCancelled()) {
                        setIsLoading(false);
                    }
                }
            };

            run();
        }, 500);

        return () => {
            cancelled = true;
            clearTimeout(debounceTimer);
        };
    }, [
        $displayHidingZones,
        $displayHidingZonesOptions,
        $hidingRadius,
        $hidingRadiusUnits,
        $mergeDuplicates,
        zoneBoundary,
    ]);

    return { hidingZoneCircles, hidingZoneMask, hidingZonePois, isLoading };
}
