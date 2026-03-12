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
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Questions } from "../../../src/maps/schema";
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
}: Props) {
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
                            fillColor: colors.TENTACLES,
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
                            fillColor: colors.THERMOMETER,
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
                        style={{ fillColor: colors.MATCHING, fillOpacity: 0.2 }}
                    />
                </ShapeSource>
            )}

            {/* Measuring eliminated-region fills */}
            {measuringRegions.length > 0 && (
                <ShapeSource id="meas-fills" shape={measuringFills}>
                    <FillLayer
                        id="meas-fill"
                        style={{
                            fillColor: colors.MEASURING,
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
                            lineColor: colors.MEASURING,
                            lineWidth: 2,
                            lineOpacity: 0.8,
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

            {/* Radius eliminated-area fills */}
            {radiusRegions.length > 0 && (
                <ShapeSource id="radius-fills" shape={radiusFills}>
                    <FillLayer
                        id="radius-fill"
                        style={{ fillColor: colors.RADIUS, fillOpacity: 0.2 }}
                    />
                </ShapeSource>
            )}

            {/* Radius circle outlines — all radius circles in one source */}
            {radiusCircleLines.features.length > 0 && (
                <ShapeSource id="radius-circles" shape={radiusCircleLines}>
                    <LineLayer
                        id="radius-circles-line"
                        style={{
                            lineColor: colors.RADIUS,
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
                            lineColor: colors.TENTACLES,
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
                            lineColor: colors.THERMOMETER,
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
                            circleColor: [
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
                                style={[{ backgroundColor: colors.RADIUS }, markerShadow]}
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
                                style={[{ backgroundColor: colors.THERMOMETER_A }, markerShadow]}
                            >
                                <Text className="text-white text-sm font-bold">A</Text>
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
                                style={[{ backgroundColor: colors.THERMOMETER_B }, markerShadow]}
                            >
                                <Text className="text-white text-sm font-bold">B</Text>
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
                                style={[{ backgroundColor: colors.TENTACLES }, markerShadow]}
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
                                  style={[{ backgroundColor: colors.TENTACLES }, markerShadow]}
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
                                style={[{ backgroundColor: colors.MATCHING }, markerShadow]}
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
                                style={[{ backgroundColor: colors.MEASURING }, markerShadow]}
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
                                style={[{ backgroundColor: colors.MEASURING }, markerShadow]}
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
