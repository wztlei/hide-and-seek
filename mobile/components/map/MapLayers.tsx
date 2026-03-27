import {
    CircleLayer,
    FillLayer,
    LineLayer,
    MarkerView,
    ShapeSource,
} from "@maplibre/maplibre-react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
    Feature,
    FeatureCollection,
    LineString,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import { useStore } from "@nanostores/react";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Questions } from "../../../src/maps/schema";
import {
    polyGeoJSON,
    showHidingZoneCircles,
    uniformQuestionColor,
} from "../../lib/context";
import { colors } from "../../lib/colors";
import {
    radiusCircle,
    tentaclesCircle,
    thermometerBisector,
} from "../../lib/mapGeometry";
import type {
    MatchingRegion,
    MeasuringRegion,
    RadiusRegion,
    TentaclesRegion,
    ThermometerRegion,
} from "../../hooks/useEliminationMask";
import { UserLocationDot } from "./UserLocationDot";

interface Props {
    eliminationMask: Feature<Polygon | MultiPolygon> | null;
    /** Raw game zone boundary — always rendered as a line. */
    zoneBoundary: Feature<Polygon | MultiPolygon> | null;
    /** Eliminated portions of the game zone per radius question. */
    radiusRegions: RadiusRegion[];
    /** Valid Voronoi halves per thermometer question, clipped to game zone. */
    thermometerRegions: ThermometerRegion[];
    /** Selected POI Voronoi cells per tentacles question, clipped to circle + zone. */
    tentaclesRegions: TentaclesRegion[];
    /** Eliminated regions per matching question (boundary fill). */
    matchingRegions: MatchingRegion[];
    /** Eliminated regions per measuring question (distance-buffer fill). */
    measuringRegions: MeasuringRegion[];
    questions: Questions;
    userCoord: [number, number] | null;
    pendingCoord: [number, number] | null;
    /** Called when any question marker is tapped. Opens the edit panel. */
    onMarkerPress: (key: number) => void;
    /** When true (pick-mode active), marker Pressables are disabled so taps reach the map. */
    isPickMode: boolean;
    /** Hiding zone circles (clipped to zone, optionally unioned) — used for outlines only. */
    hidingZoneCircles: FeatureCollection<Polygon> | null;
    /** Zone boundary minus the union of hiding circles — the shaded "outside" area. */
    hidingZoneMask: Feature<Polygon | MultiPolygon> | null;
    /** Raw transit stop points for hiding zone dot layer. */
    hidingZonePois: Feature<Point>[];
    /** Called when the user taps a hiding zone transit stop dot. */
    onHidingZonePoiPress: (coord: [number, number]) => void;
    /** The currently-tapped POI coord — rendered larger to show selection. */
    selectedHidingZonePoi: [number, number] | null;
    /** Whether the user is actively drawing a polygon. */
    drawingPolygon: boolean;
    /** Vertices collected so far during polygon drawing. */
    polygonVertices: [number, number][];
    /** True while the user is in map-tap mode for adding/removing custom POIs. */
    customPOITapActive: boolean;
    /** User-added custom POI points for the selected type. */
    customPOIPoints: Feature<Point>[];
    /** Overpass-fetched POIs for the selected type. */
    overpassPOIPoints: Feature<Point>[];
    /** Coord IDs of excluded Overpass POIs. */
    excludedPOIIds: Set<string>;
    /** Called when the user taps a custom (green) POI. */
    onCustomPOIPress: (id: string) => void;
    /** Called when the user taps an Overpass POI to toggle exclusion. */
    onOverpassPOIPress: (
        coordId: string,
        name: string | undefined,
        isExcluded: boolean,
    ) => void;
    /** Draft coord placed by tapping the map — shown as a ring until confirmed. */
    pendingCustomPOICoord: [number, number] | null;
}

/**
 * All data-driven children of the MapLibre MapView:
 *  - User location dot
 *  - Elimination mask (blue filled overlay outside the valid zone)
 *  - Per-type consolidated ShapeSource + Layer pairs (one source per question type)
 *  - Interactive MarkerViews for question anchor points
 *  - Pending coord marker (orange pin shown during map-pick mode)
 *
 * Returns a Fragment so its children are rendered as direct siblings inside
 * the parent <MapView>. This is required — MapLibre layers must be direct
 * children of <MapView>.
 */
/** Coord ID for a Point feature: `${lng.toFixed(5)},${lat.toFixed(5)}` */
function poiCoordId(f: Feature<Point>): string {
    return `${f.geometry.coordinates[0].toFixed(5)},${f.geometry.coordinates[1].toFixed(5)}`;
}

export function MapLayers({
    eliminationMask,
    zoneBoundary,
    radiusRegions,
    thermometerRegions,
    tentaclesRegions,
    matchingRegions,
    measuringRegions,
    questions,
    userCoord,
    pendingCoord,
    onMarkerPress,
    isPickMode,
    hidingZoneCircles,
    hidingZoneMask,
    hidingZonePois,
    onHidingZonePoiPress,
    selectedHidingZonePoi,
    drawingPolygon,
    polygonVertices,
    customPOITapActive,
    customPOIPoints,
    overpassPOIPoints,
    excludedPOIIds,
    onCustomPOIPress,
    onOverpassPOIPress,
    pendingCustomPOICoord,
}: Props) {
    const $showHidingZoneCircles = useStore(showHidingZoneCircles);
    const $polyGeoJSON = useStore(polyGeoJSON);
    const $uniformQuestionColor = useStore(uniformQuestionColor);
    const qc = (typeColor: string) =>
        $uniformQuestionColor ? colors.PRIMARY : typeColor;

    // ── Consolidated FeatureCollections (one per question type) ──────────────
    // Each replaces N per-question ShapeSources with a single source, reducing
    // native layer objects from ~60 to ~12 regardless of question count.

    const tentaclesFills = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: tentaclesRegions.map((r) => r.region),
        }),
        [tentaclesRegions],
    );

    const thermometerFills = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: thermometerRegions.map((r) => r.region),
        }),
        [thermometerRegions],
    );

    const matchingFills = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: matchingRegions.map((r) => r.region),
        }),
        [matchingRegions],
    );

    const measuringFills = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: measuringRegions.map((r) => r.region),
        }),
        [measuringRegions],
    );

    const measuringCircleLines = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: measuringRegions.flatMap((r) => r.circles),
        }),
        [measuringRegions],
    );

    const radiusFills = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: radiusRegions.map((r) => r.region),
        }),
        [radiusRegions],
    );

    const radiusCircleLines = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: questions
                .filter((q) => q.id === "radius")
                .map((q) => radiusCircle(q)),
        }),
        [questions],
    );

    const tentaclesCircleLines = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: questions
                .filter((q) => q.id === "tentacles")
                .map((q) => tentaclesCircle(q as any)),
        }),
        [questions],
    );

    const thermometerBisectorLines = useMemo<FeatureCollection>(
        () => ({
            type: "FeatureCollection",
            features: questions
                .filter((q) => q.id === "thermometer")
                .map((q) => thermometerBisector(q)),
        }),
        [questions],
    );

    // ── Polygon drawing geometry ─────────────────────────────────────────────

    const drawEdges = useMemo<FeatureCollection<LineString>>(() => {
        if (!drawingPolygon || polygonVertices.length < 2) {
            return { type: "FeatureCollection", features: [] };
        }
        const coords = [...polygonVertices];
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: coords },
                    properties: {},
                },
            ],
        };
    }, [drawingPolygon, polygonVertices]);

    const drawVertices = useMemo<FeatureCollection<Point>>(() => {
        if (!drawingPolygon || polygonVertices.length === 0) {
            return { type: "FeatureCollection", features: [] };
        }
        return {
            type: "FeatureCollection",
            features: polygonVertices.map((coord) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: coord },
                properties: {},
            })),
        };
    }, [drawingPolygon, polygonVertices]);

    const drawFirstVertex = useMemo<Feature<Point> | null>(() => {
        if (!drawingPolygon || polygonVertices.length < 3) return null;
        return {
            type: "Feature",
            geometry: { type: "Point", coordinates: polygonVertices[0] },
            properties: {},
        };
    }, [drawingPolygon, polygonVertices]);

    // ── Merged POI dots ──────────────────────────────────────────────────────
    // Single CircleLayer across all question types — one GPU draw call.
    const poiDotCollection = useMemo<FeatureCollection<Point>>(() => {
        const features: Feature<Point>[] = [];

        tentaclesRegions.forEach(({ location, pois }) => {
            const locationName = (location as any)?.properties?.name;
            pois.filter(
                (poi) => (poi as any).properties?.name !== locationName,
            ).forEach((poi) => {
                features.push({
                    type: "Feature",
                    geometry: poi.geometry,
                    properties: { ...(poi.properties ?? {}), _qt: "tentacles" },
                });
            });
        });

        matchingRegions.forEach(({ pois }) => {
            pois.forEach((poi) => {
                features.push({
                    type: "Feature",
                    geometry: poi.geometry,
                    properties: { ...(poi.properties ?? {}), _qt: "matching" },
                });
            });
        });

        measuringRegions.forEach(({ pois }) => {
            pois.forEach((poi) => {
                features.push({
                    type: "Feature",
                    geometry: poi.geometry,
                    properties: { ...(poi.properties ?? {}), _qt: "measuring" },
                });
            });
        });

        return { type: "FeatureCollection", features };
    }, [tentaclesRegions, matchingRegions, measuringRegions]);

    return (
        <>
            {userCoord && (
                <MarkerView coordinate={userCoord}>
                    <UserLocationDot />
                </MarkerView>
            )}

            {/* Tentacles valid-region fills — rendered below the elimination mask
                so the indigo mask on top correctly clips them to the game zone */}
            {tentaclesRegions.length > 0 && (
                <ShapeSource id="tent-fills" shape={tentaclesFills}>
                    <FillLayer
                        id="tent-fill"
                        style={{
                            fillColor: qc(colors.TENTACLES),
                            fillOpacity: 0.2,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Thermometer valid-half fills */}
            {thermometerRegions.length > 0 && (
                <ShapeSource id="therm-fills" shape={thermometerFills}>
                    <FillLayer
                        id="therm-fill"
                        style={{
                            fillColor: qc(colors.THERMOMETER),
                            fillOpacity: 0.15,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Matching eliminated-region fills */}
            {matchingRegions.length > 0 && (
                <ShapeSource id="match-fills" shape={matchingFills}>
                    <FillLayer
                        id="match-fill"
                        style={{
                            fillColor: qc(colors.MATCHING),
                            fillOpacity: 0.2,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Measuring eliminated-region fills */}
            {measuringRegions.length > 0 && (
                <ShapeSource id="meas-fills" shape={measuringFills}>
                    <FillLayer
                        id="meas-fill"
                        style={{
                            fillColor: qc(colors.MEASURING),
                            fillOpacity: 0.2,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Measuring buffer circle outlines — all POI circles across all questions */}
            {measuringCircleLines.features.length > 0 && (
                <ShapeSource id="meas-circles" shape={measuringCircleLines}>
                    <LineLayer
                        id="meas-circles-line"
                        style={{
                            lineColor: qc(colors.MEASURING),
                            lineWidth: 2,
                            lineOpacity: 0.8,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Hiding zone mask — area inside the zone but OUTSIDE all hiding circles.
                Rendered below the elimination mask so the indigo overlay clips correctly. */}
            {hidingZoneMask && (
                <ShapeSource id="hiding-zone-mask" shape={hidingZoneMask}>
                    <FillLayer
                        id="hiding-zone-mask-fill"
                        style={{
                            fillColor: colors.RADIUS,
                            fillOpacity: 0.12,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Hiding zone circle outlines */}
            {$showHidingZoneCircles &&
                hidingZoneCircles &&
                hidingZoneCircles.features.length > 0 && (
                    <ShapeSource
                        id="hiding-zone-circles"
                        shape={hidingZoneCircles}
                    >
                        <LineLayer
                            id="hiding-zone-line"
                            style={{
                                lineColor: colors.RADIUS,
                                lineWidth: 1.5,
                                lineOpacity: 0.7,
                            }}
                        />
                    </ShapeSource>
                )}

            {/* Indigo overlay covering the eliminated (impossible) zone */}
            {eliminationMask && (
                <ShapeSource id="zone-mask" shape={eliminationMask}>
                    <FillLayer
                        id="zone-mask-fill"
                        style={{
                            fillColor: colors.ZONE_MASK,
                            fillOpacity: 0.2,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Zone boundary line — always visible on top of the elimination mask */}
            {zoneBoundary && (
                <ShapeSource id="zone-boundary" shape={zoneBoundary}>
                    <LineLayer
                        id="zone-boundary-line"
                        style={{
                            lineColor: colors.ZONE_MASK,
                            lineWidth: 3,
                            lineOpacity: 1,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Drawn polygon outlines — always mounted to avoid MapLibre source-removal crash */}
            <ShapeSource
                id="poly-geojson-outline"
                shape={
                    $polyGeoJSON ?? { type: "FeatureCollection", features: [] }
                }
            >
                <LineLayer
                    id="poly-geojson-outline-line"
                    style={{
                        lineColor: colors.PRIMARY,
                        lineWidth: 2,
                        lineOpacity: 0.5,
                    }}
                />
            </ShapeSource>

            {/* ── Polygon drawing layers — always mounted to avoid MapLibre source-removal crash */}

            {/* Edge lines — dashed blue outline of the polygon being drawn */}
            <ShapeSource id="polygon-draw-lines" shape={drawEdges}>
                <LineLayer
                    id="polygon-draw-lines-layer"
                    style={{
                        lineColor: "#3b82f6",
                        lineWidth: 2,
                        lineDasharray: [4, 3],
                    }}
                />
            </ShapeSource>

            {/* Vertex dots */}
            <ShapeSource id="polygon-draw-vertices" shape={drawVertices}>
                <CircleLayer
                    id="polygon-draw-vertices-layer"
                    style={{
                        circleRadius: 5,
                        circleColor: "white",
                        circleStrokeWidth: 2,
                        circleStrokeColor: "#3b82f6",
                    }}
                />
            </ShapeSource>

            {/* First-vertex close-target — rendered larger when ≥ 3 vertices */}
            <ShapeSource
                id="polygon-draw-first"
                shape={
                    drawFirstVertex ?? {
                        type: "FeatureCollection",
                        features: [],
                    }
                }
            >
                <CircleLayer
                    id="polygon-draw-first-layer"
                    style={{
                        circleRadius: 9,
                        circleColor: "#3b82f6",
                        circleOpacity: 0.9,
                        circleStrokeWidth: 2,
                        circleStrokeColor: "white",
                    }}
                />
            </ShapeSource>

            {/* Radius eliminated-area fills */}
            {radiusRegions.length > 0 && (
                <ShapeSource id="radius-fills" shape={radiusFills}>
                    <FillLayer
                        id="radius-fill"
                        style={{
                            fillColor: qc(colors.RADIUS),
                            fillOpacity: 0.2,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Radius circle outlines — all radius circles in one source */}
            {radiusCircleLines.features.length > 0 && (
                <ShapeSource id="radius-circles" shape={radiusCircleLines}>
                    <LineLayer
                        id="radius-circles-line"
                        style={{
                            lineColor: qc(colors.RADIUS),
                            lineWidth: 2,
                            lineOpacity: 0.8,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Tentacles circle outlines */}
            {tentaclesCircleLines.features.length > 0 && (
                <ShapeSource id="tent-circles" shape={tentaclesCircleLines}>
                    <LineLayer
                        id="tent-circles-line"
                        style={{
                            lineColor: qc(colors.TENTACLES),
                            lineWidth: 2,
                            lineOpacity: 0.8,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Thermometer dividing lines — perpendicular bisectors of A↔B.
                Must appear before any MarkerView blocks or MapLibre drops the layer. */}
            {thermometerBisectorLines.features.length > 0 && (
                <ShapeSource id="therm-lines" shape={thermometerBisectorLines}>
                    <LineLayer
                        id="therm-lines-line"
                        style={{
                            lineColor: qc(colors.THERMOMETER),
                            lineWidth: 2,
                            lineDasharray: [4, 3],
                            lineOpacity: 0.8,
                        }}
                    />
                </ShapeSource>
            )}

            {/* All POI dots (tentacles / matching / measuring) — single GPU draw call.
                Must come before interactive MarkerViews or MapLibre drops this layer. */}
            {poiDotCollection.features.length > 0 && (
                <ShapeSource id="poi-dots-src" shape={poiDotCollection}>
                    <CircleLayer
                        id="poi-dots-layer"
                        style={{
                            circleRadius: 7,
                            circleColor: $uniformQuestionColor
                                ? colors.PRIMARY
                                : [
                                      "match",
                                      ["get", "_qt"],
                                      "tentacles",
                                      colors.TENTACLES,
                                      "matching",
                                      colors.MATCHING,
                                      "measuring",
                                      colors.MEASURING,
                                      "#999999",
                                  ],
                            circleOpacity: 0.8,
                            circleStrokeWidth: 1.5,
                            circleStrokeColor: "white",
                        }}
                    />
                </ShapeSource>
            )}

            {/* Hiding zone transit stop dots — always mounted to avoid MapLibre
                "source in use, cannot remove" crash on conditional unmount. */}
            <ShapeSource
                id="hiding-zone-pois"
                shape={{ type: "FeatureCollection", features: hidingZonePois }}
                onPress={(e) => {
                    if (drawingPolygon) return;
                    const f = e.features[0];
                    if (!f || f.geometry.type !== "Point") return;
                    const [lng, lat] = f.geometry.coordinates as [
                        number,
                        number,
                    ];
                    onHidingZonePoiPress([lng, lat]);
                }}
            >
                <CircleLayer
                    id="hiding-zone-poi-dots"
                    style={{
                        circleRadius: 4,
                        circleColor: colors.RADIUS,
                        circleOpacity: 0.8,
                    }}
                />
            </ShapeSource>

            {/* Selected hiding zone POI — rendered larger to show which stop was tapped.
                Always mounted (never conditionally unmounted) to avoid a MapLibre crash
                when the source is torn down and immediately recreated on a second tap. */}
            <ShapeSource
                id="hiding-zone-poi-selected"
                shape={
                    selectedHidingZonePoi
                        ? {
                              type: "Feature" as const,
                              geometry: {
                                  type: "Point" as const,
                                  coordinates: selectedHidingZonePoi,
                              },
                              properties: {},
                          }
                        : { type: "FeatureCollection" as const, features: [] }
                }
            >
                <CircleLayer
                    id="hiding-zone-poi-selected-dot"
                    style={{
                        circleRadius: 7,
                        circleColor: colors.RADIUS,
                        circleOpacity: 1,
                        circleStrokeWidth: 2,
                        circleStrokeColor: "white",
                    }}
                />
            </ShapeSource>

            {/* Custom POI mode — Overpass POIs (tappable; excluded ones grey) */}
            {customPOITapActive && (
                <ShapeSource
                    id="custom-mode-overpass"
                    shape={{
                        type: "FeatureCollection",
                        features: overpassPOIPoints.map((f) => ({
                            ...f,
                            properties: {
                                ...f.properties,
                                _excluded: excludedPOIIds.has(poiCoordId(f))
                                    ? 1
                                    : 0,
                                _coordId: poiCoordId(f),
                            },
                        })),
                    }}
                    onPress={(e) => {
                        const props = e.features[0]?.properties;
                        const coordId = props?._coordId as string | undefined;
                        if (coordId)
                            onOverpassPOIPress(
                                coordId,
                                props?.name as string | undefined,
                                props?._excluded === 1,
                            );
                    }}
                >
                    <CircleLayer
                        id="custom-mode-overpass-layer"
                        style={{
                            circleRadius: 4,
                            // Hollow ring: white fill with colored stroke
                            circleColor: "white",
                            circleOpacity: [
                                "case",
                                ["==", ["get", "_excluded"], 1],
                                0.5,
                                1,
                            ] as any,
                            circleStrokeWidth: 5,
                            circleStrokeColor: [
                                "case",
                                ["==", ["get", "_excluded"], 1],
                                "#9ca3af",
                                colors.PRIMARY,
                            ] as any,
                            circleStrokeOpacity: [
                                "case",
                                ["==", ["get", "_excluded"], 1],
                                0.5,
                                1,
                            ] as any,
                        }}
                    />
                </ShapeSource>
            )}

            {/* Custom POI mode — user-added POIs (green, tappable to delete) */}
            {customPOITapActive && (
                <ShapeSource
                    id="custom-mode-custom"
                    shape={{
                        type: "FeatureCollection",
                        features: customPOIPoints,
                    }}
                    onPress={(e) => {
                        const id = e.features[0]?.properties?.id as
                            | string
                            | undefined;
                        if (id) onCustomPOIPress(id);
                    }}
                >
                    <CircleLayer
                        id="custom-mode-custom-layer"
                        style={{
                            // Solid dot: colored fill with white stroke
                            circleRadius: 8,
                            circleColor: colors.PRIMARY,
                            circleOpacity: 1,
                            circleStrokeWidth: 2,
                            circleStrokeColor: "white",
                        }}
                    />
                </ShapeSource>
            )}

            {/* Custom POI mode — draft pending coord (orange dot) */}
            {pendingCustomPOICoord && (
                <ShapeSource
                    id="custom-mode-pending"
                    shape={{
                        type: "Feature" as const,
                        geometry: {
                            type: "Point" as const,
                            coordinates: pendingCustomPOICoord,
                        },
                        properties: {},
                    }}
                >
                    <CircleLayer
                        id="custom-mode-pending-layer"
                        style={{
                            circleRadius: 10,
                            circleColor: "#f97316",
                            circleOpacity: 0.9,
                            circleStrokeWidth: 2.5,
                            circleStrokeColor: "white",
                        }}
                    />
                </ShapeSource>
            )}

            {/* Radius center markers */}
            {questions
                .filter((q) => q.id === "radius")
                .map((q) => (
                    <MarkerView
                        key={`m-${q.key}`}
                        coordinate={[q.data.lng, q.data.lat]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[34px] h-[34px] rounded-full items-center justify-center"
                                style={[
                                    { backgroundColor: qc(colors.RADIUS) },
                                    markerShadow,
                                ]}
                            >
                                <Ionicons
                                    name="disc-outline"
                                    size={18}
                                    color="white"
                                />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Thermometer A/B point markers */}
            {questions
                .filter((q) => q.id === "thermometer")
                .flatMap((q) => [
                    <MarkerView
                        key={`therm-a-${q.key}`}
                        coordinate={[q.data.lngA, q.data.latA]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[34px] h-[34px] rounded-full items-center justify-center"
                                style={[
                                    {
                                        backgroundColor: qc(
                                            colors.THERMOMETER_A,
                                        ),
                                    },
                                    markerShadow,
                                ]}
                            >
                                <Text className="text-white text-sm font-bold">
                                    A
                                </Text>
                            </View>
                        </Pressable>
                    </MarkerView>,
                    <MarkerView
                        key={`therm-b-${q.key}`}
                        coordinate={[q.data.lngB, q.data.latB]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[34px] h-[34px] rounded-full items-center justify-center"
                                style={[
                                    {
                                        backgroundColor: qc(
                                            colors.THERMOMETER_B,
                                        ),
                                    },
                                    markerShadow,
                                ]}
                            >
                                <Text className="text-white text-sm font-bold">
                                    B
                                </Text>
                            </View>
                        </Pressable>
                    </MarkerView>,
                ])}

            {/* Tentacles anchor markers */}
            {questions
                .filter((q) => q.id === "tentacles")
                .map((q) => (
                    <MarkerView
                        key={`tent-m-${q.key}`}
                        coordinate={[q.data.lng, q.data.lat]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[34px] h-[34px] rounded-full items-center justify-center"
                                style={[
                                    { backgroundColor: qc(colors.TENTACLES) },
                                    markerShadow,
                                ]}
                            >
                                <Ionicons
                                    name="pie-chart-outline"
                                    size={18}
                                    color="white"
                                />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Tentacles selected-location markers — only in inside mode */}
            {tentaclesRegions.flatMap(({ key, location }) =>
                location
                    ? [
                          <MarkerView
                              key={`tent-loc-${key}`}
                              coordinate={
                                  location.geometry.coordinates as [
                                      number,
                                      number,
                                  ]
                              }
                          >
                              <Pressable
                                  onPress={() => onMarkerPress(key)}
                                  pointerEvents={isPickMode ? "none" : "auto"}
                                  hitSlop={8}
                              >
                                  <View
                                      className="w-[26px] h-[26px] rounded-full items-center justify-center"
                                      style={[
                                          {
                                              backgroundColor: qc(
                                                  colors.TENTACLES,
                                              ),
                                          },
                                          markerShadow,
                                      ]}
                                  >
                                      <Ionicons
                                          name="location"
                                          size={14}
                                          color="white"
                                      />
                                  </View>
                              </Pressable>
                          </MarkerView>,
                      ]
                    : [],
            )}

            {/* Matching seeker location markers */}
            {questions
                .filter((q) => q.id === "matching")
                .map((q) => (
                    <MarkerView
                        key={`match-m-${q.key}`}
                        coordinate={[q.data.lng, q.data.lat]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[34px] h-[34px] rounded-full items-center justify-center"
                                style={[
                                    { backgroundColor: qc(colors.MATCHING) },
                                    markerShadow,
                                ]}
                            >
                                <Ionicons
                                    name="reorder-two-outline"
                                    size={18}
                                    color="white"
                                />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Measuring seeker location markers */}
            {questions
                .filter((q) => q.id === "measuring")
                .map((q) => (
                    <MarkerView
                        key={`meas-m-${q.key}`}
                        coordinate={[q.data.lng, q.data.lat]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[34px] h-[34px] rounded-full items-center justify-center"
                                style={[
                                    { backgroundColor: qc(colors.MEASURING) },
                                    markerShadow,
                                ]}
                            >
                                <Ionicons
                                    name="resize-outline"
                                    size={18}
                                    color="white"
                                />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Measuring additional-search-region markers — only when explicitly set */}
            {questions
                .filter(
                    (q) =>
                        q.id === "measuring" &&
                        (q.data as any).poiSearchLat != null,
                )
                .map((q) => (
                    <MarkerView
                        key={`meas-search-${q.key}`}
                        coordinate={[
                            (q.data as any).poiSearchLng,
                            (q.data as any).poiSearchLat,
                        ]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            pointerEvents={isPickMode ? "none" : "auto"}
                            hitSlop={8}
                        >
                            <View
                                className="w-[26px] h-[26px] rounded-full border-2 border-white items-center justify-center opacity-[0.85]"
                                style={[
                                    { backgroundColor: qc(colors.MEASURING) },
                                    markerShadow,
                                ]}
                            >
                                <Ionicons
                                    name="search-outline"
                                    size={14}
                                    color="white"
                                />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Orange pending-coord pin shown during map-pick mode phase 2 */}
            {pendingCoord && (
                <MarkerView coordinate={pendingCoord}>
                    <View
                        className="w-9 h-9 rounded-full border-2 border-white items-center justify-center"
                        style={[{ backgroundColor: "#f97316" }, markerShadow]}
                    >
                        <Ionicons name="location" size={22} color="white" />
                    </View>
                </MarkerView>
            )}
        </>
    );
}

// Shadow shared by all map markers — no NativeWind equivalent for shadow props
const markerShadow = {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
} as const;
