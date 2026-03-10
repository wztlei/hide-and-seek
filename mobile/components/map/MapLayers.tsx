import {
    FillLayer,
    LineLayer,
    MarkerView,
    ShapeSource,
} from "@maplibre/maplibre-react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { radiusCircle, tentaclesCircle, thermometerBisector } from "../../lib/mapGeometry";
import type { MatchingRegion, MeasuringRegion, RadiusRegion, TentaclesRegion, ThermometerRegion } from "../../hooks/useEliminationMask";
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
}

/**
 * All data-driven children of the MapLibre MapView:
 *  - User location dot
 *  - Elimination mask (blue filled overlay outside the valid zone)
 *  - Radius question: circle fill + outline + center marker
 *  - Thermometer question: Voronoi dividing line + A/B point markers
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
}: Props) {
    return (
        <>
            {userCoord && (
                <MarkerView coordinate={userCoord}>
                    <UserLocationDot />
                </MarkerView>
            )}

            {/* Tentacles valid-region fills — rendered below the elimination mask
                so the indigo mask on top correctly clips them to the game zone */}
            {tentaclesRegions.map(({ key, region }) => (
                <ShapeSource
                    key={`tent-fill-${key}`}
                    id={`tent-fill-src-${key}`}
                    shape={region}
                >
                    <FillLayer
                        id={`tent-fill-layer-${key}`}
                        style={{ fillColor: colors.TENTACLES, fillOpacity: 0.2 }}
                    />
                </ShapeSource>
            ))}

            {/* Thermometer valid-half fills — rendered below the elimination mask
                so the indigo mask on top correctly clips them to the game zone */}
            {thermometerRegions.map(({ key, region }) => (
                <ShapeSource
                    key={`therm-fill-${key}`}
                    id={`therm-fill-src-${key}`}
                    shape={region}
                >
                    <FillLayer
                        id={`therm-fill-layer-${key}`}
                        style={{
                            fillColor: colors.THERMOMETER,
                            fillOpacity: 0.15,
                        }}
                    />
                </ShapeSource>
            ))}

            {/* Matching eliminated-region fills — rendered below the elimination mask
                so the indigo mask on top correctly clips them to the game zone */}
            {matchingRegions.map(({ key, region }) => (
                <ShapeSource
                    key={`match-fill-${key}`}
                    id={`match-fill-src-${key}`}
                    shape={region}
                >
                    <FillLayer
                        id={`match-fill-layer-${key}`}
                        style={{ fillColor: colors.MATCHING, fillOpacity: 0.2 }}
                    />
                </ShapeSource>
            ))}

            {/* Measuring eliminated-region fills — rendered below the elimination mask
                so the indigo mask on top correctly clips them to the game zone */}
            {measuringRegions.map(({ key, region }) => (
                <ShapeSource
                    key={`meas-fill-${key}`}
                    id={`meas-fill-src-${key}`}
                    shape={region}
                >
                    <FillLayer
                        id={`meas-fill-layer-${key}`}
                        style={{ fillColor: colors.MEASURING, fillOpacity: 0.2 }}
                    />
                </ShapeSource>
            ))}

            {/* Indigo overlay covering the eliminated (impossible) zone */}
            {eliminationMask && (
                <ShapeSource id="zone-mask" shape={eliminationMask}>
                    <FillLayer
                        id="zone-mask-fill"
                        style={{ fillColor: colors.ZONE_MASK, fillOpacity: 0.2 }}
                    />
                </ShapeSource>
            )}

            {/* Zone boundary line — always visible on top of the elimination mask
                fill so the game area outline persists regardless of questions */}
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

            {/* Radius eliminated-area fills — only the portion removed by this
                question is shaded; the valid region is left clear */}
            {radiusRegions.map(({ key, region }) => (
                <ShapeSource
                    key={`radius-elim-${key}`}
                    id={`radius-elim-src-${key}`}
                    shape={region}
                >
                    <FillLayer
                        id={`radius-elim-fill-${key}`}
                        style={{
                            fillColor: colors.RADIUS,
                            fillOpacity: 0.2,
                        }}
                    />
                </ShapeSource>
            ))}

            {/* Radius circle outlines */}
            {questions
                .filter((q) => q.id === "radius")
                .map((q) => (
                        <ShapeSource
                            key={q.key}
                            id={`radius-${q.key}`}
                            shape={radiusCircle(q)}
                        >
                            <LineLayer
                                id={`radius-line-${q.key}`}
                                style={{
                                    lineColor: colors.RADIUS,
                                    lineWidth: 2,
                                    lineOpacity: 0.8,
                                }}
                            />
                        </ShapeSource>
                ))}

            {/* Tentacles circle outlines */}
            {questions
                .filter((q) => q.id === "tentacles")
                .map((q) => (
                    <ShapeSource
                        key={`tent-circle-${q.key}`}
                        id={`tent-circle-src-${q.key}`}
                        shape={tentaclesCircle(q as any)}
                    >
                        <LineLayer
                            id={`tent-circle-line-${q.key}`}
                            style={{
                                lineColor: colors.TENTACLES,
                                lineWidth: 2,
                                lineOpacity: 0.8,
                            }}
                        />
                    </ShapeSource>
                ))}

            {/* Thermometer dividing lines — perpendicular bisector of A↔B.
                Must appear before any MarkerView blocks or MapLibre drops the layer. */}
            {questions
                .filter((q) => q.id === "thermometer")
                .map((q) => (
                    <ShapeSource
                        key={`therm-${q.key}`}
                        id={`therm-line-${q.key}`}
                        shape={thermometerBisector(q)}
                    >
                        <LineLayer
                            id={`therm-line-layer-${q.key}`}
                            style={{
                                lineColor: colors.THERMOMETER,
                                lineWidth: 2,
                                lineDasharray: [4, 3],
                                lineOpacity: 0.8,
                            }}
                        />
                    </ShapeSource>
                ))}

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
                            hitSlop={8}
                        >
                            <View style={styles.radiusMarker}>
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
                            hitSlop={8}
                        >
                            <View
                                style={[
                                    styles.thermMarker,
                                    { backgroundColor: colors.THERMOMETER_A },
                                ]}
                            >
                                <Text style={styles.thermMarkerLabel}>A</Text>
                            </View>
                        </Pressable>
                    </MarkerView>,
                    <MarkerView
                        key={`therm-b-${q.key}`}
                        coordinate={[q.data.lngB, q.data.latB]}
                    >
                        <Pressable
                            onPress={() => onMarkerPress(q.key)}
                            hitSlop={8}
                        >
                            <View
                                style={[
                                    styles.thermMarker,
                                    { backgroundColor: colors.THERMOMETER_B },
                                ]}
                            >
                                <Text style={styles.thermMarkerLabel}>B</Text>
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
                        <Pressable onPress={() => onMarkerPress(q.key)} hitSlop={8}>
                            <View style={styles.tentaclesMarker}>
                                <Ionicons name="pie-chart-outline" size={18} color="white" />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Tentacles POI dots — nearby POIs (capped to avoid OOM from too many MarkerViews) */}
            {tentaclesRegions.flatMap(({ key, location, pois }) =>
                pois
                    .filter(
                        (poi) =>
                            (poi as any).properties?.name !==
                            (location as any).properties?.name,
                    )
                    .slice(0, 30)
                    .map((poi) => {
                        const name = (poi as any).properties?.name as string;
                        return (
                            <MarkerView
                                key={`tent-poi-${key}-${name}`}
                                coordinate={
                                    poi.geometry.coordinates as [number, number]
                                }
                            >
                                <View style={styles.tentaclesPOIDot} />
                            </MarkerView>
                        );
                    }),
            )}

            {/* Tentacles selected-location markers */}
            {tentaclesRegions.map(({ key, location }) => (
                <MarkerView
                    key={`tent-loc-${key}`}
                    coordinate={location.geometry.coordinates as [number, number]}
                >
                    <Pressable onPress={() => onMarkerPress(key)} hitSlop={8}>
                        <View style={styles.tentaclesLocationMarker}>
                            <Ionicons name="location" size={14} color="white" />
                        </View>
                    </Pressable>
                </MarkerView>
            ))}

            {/* Matching seeker location markers */}
            {questions
                .filter((q) => q.id === "matching")
                .map((q) => (
                    <MarkerView
                        key={`match-m-${q.key}`}
                        coordinate={[q.data.lng, q.data.lat]}
                    >
                        <Pressable onPress={() => onMarkerPress(q.key)} hitSlop={8}>
                            <View style={styles.matchingMarker}>
                                <Ionicons name="reorder-two-outline" size={18} color="white" />
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
                        <Pressable onPress={() => onMarkerPress(q.key)} hitSlop={8}>
                            <View style={styles.measuringMarker}>
                                <Ionicons name="resize-outline" size={18} color="white" />
                            </View>
                        </Pressable>
                    </MarkerView>
                ))}

            {/* Orange pending-coord pin shown during map-pick mode phase 2 */}
            {pendingCoord && (
                <MarkerView coordinate={pendingCoord}>
                    <View style={styles.pendingMarker}>
                        <Ionicons name="location" size={22} color="white" />
                    </View>
                </MarkerView>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    radiusMarker: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.RADIUS,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    thermMarker: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    thermMarkerLabel: {
        color: "white",
        fontSize: 14,
        fontWeight: "700",
    },
    tentaclesMarker: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.TENTACLES,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    tentaclesLocationMarker: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.TENTACLES,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    tentaclesPOIDot: {
        width: 14,
        height: 14,
        borderRadius: 14,
        backgroundColor: colors.TENTACLES,
        opacity: 0.8,
        borderWidth: 1.5,
        borderColor: "white",
    },
    matchingMarker: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.MATCHING,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    measuringMarker: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.MEASURING,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
    pendingMarker: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#f97316", // orange — visually distinct from confirmed markers
        borderWidth: 2,
        borderColor: "white",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
});
