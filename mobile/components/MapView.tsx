import {
    Camera,
    type CameraRef,
    FillLayer,
    LineLayer,
    MapView as MLMapView,
    type MapViewRef,
    MarkerView,
    setAccessToken,
    ShapeSource,
    UserLocation,
} from "@maplibre/maplibre-react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import * as Location from "expo-location";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Questions } from "../../src/maps/schema";
import { colors } from "../lib/colors";
import {
    additionalMapGeoLocations,
    mapGeoJSON,
    mapGeoLocation,
    questionModified,
    questions,
    thunderforestApiKey,
} from "../lib/context";
import { fetchAllZoneBoundaries } from "../lib/fetchZoneBoundary";
import { toast } from "../lib/notifications";
import { getCached, setCached } from "../lib/storage";
import { PlacePicker } from "./PlacePicker";
import { QuestionsPanel } from "./QuestionsPanel";

const BOUNDARY_CACHE_KEY = "cachedMapGeoJSON";

// MapLibre doesn't need a Mapbox token when using OSM tiles
setAccessToken(null);

function buildStyleJSON(useThunderforest: boolean, apiKey: string): string {
    if (useThunderforest && apiKey) {
        return JSON.stringify({
            version: 8,
            sources: {
                thunderforest: {
                    type: "raster",
                    tiles: [
                        `https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${apiKey}`,
                    ],
                    tileSize: 256,
                    attribution:
                        "© OpenStreetMap contributors © Thunderforest",
                },
            },
            layers: [
                {
                    id: "bg",
                    type: "background",
                    paint: { "background-color": "#f8f4f0" },
                },
                { id: "tiles", type: "raster", source: "thunderforest" },
            ],
        });
    }
    return JSON.stringify({
        version: 8,
        sources: {
            cartodb: {
                type: "raster",
                tiles: [
                    "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                    "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                    "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                ],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors © CARTO",
            },
        },
        layers: [
            {
                id: "bg",
                type: "background",
                paint: { "background-color": "#f8f4f0" },
            },
            { id: "tiles", type: "raster", source: "cartodb" },
        ],
    });
}

function UserLocationDot() {
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 1400,
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ]),
        ).start();
    }, [pulse]);

    const ringScale = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 2.8],
    });
    const ringOpacity = pulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.5, 0.15, 0],
    });

    return (
        <View style={styles.dotContainer}>
            {/* Pulsing ring */}
            <Animated.View
                style={[
                    styles.ring,
                    { transform: [{ scale: ringScale }], opacity: ringOpacity },
                ]}
            />
            {/* White border */}
            <View style={styles.dotBorder}>
                {/* Blue fill */}
                <View style={styles.dot} />
            </View>
        </View>
    );
}

export function AppMapView() {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);
    const $mapGeoJSON = useStore(mapGeoJSON);
    const $questions = useStore(questions) as Questions;
    const [eliminationMask, setEliminationMask] = useState<Feature<
        Polygon | MultiPolygon
    > | null>(null);
    const [editingQuestionKey, setEditingQuestionKey] = useState<number | null>(
        null,
    );
    const [pickingLocationForKey, setPickingLocationForKey] = useState<
        number | null
    >(null);
    const [pendingCoord, setPendingCoord] = useState<[number, number] | null>(
        null,
    );

    // Compute elimination mask: world polygon minus the zone, matching the web's holedMask().
    // The zone itself is left clear; everything outside gets the overlay.
    // Also applies radius questions as intersect/difference on the zone.
    useEffect(() => {
        if (!$mapGeoJSON) {
            // Keep the previous mask visible while a new boundary is loading.
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
                    coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]],
                },
            };

            // turf.union requires ≥2 features; use the single feature directly to avoid the error
            let zone: Feature<Polygon | MultiPolygon> =
                features.length === 1
                    ? features[0]
                    : turf.union(turf.featureCollection(features));
            if (!zone) return;

            for (const q of $questions) {
                if (q.id !== "radius") continue;
                const { lat, lng, radius, unit, within } = q.data;
                const circle = turf.circle([lng, lat], radius, {
                    units: unit,
                    steps: 64,
                });
                if (within) {
                    const r = turf.intersect(turf.featureCollection([zone, circle]));
                    if (!r) {
                        toast.error('No solutions found');
                        setEliminationMask(world);
                        return;
                    }
                    zone = r;
                } else {
                    const r = turf.difference(turf.featureCollection([zone, circle]));
                    if (!r) {
                        toast.error('No solutions found');
                        setEliminationMask(world);
                        return;
                    }
                    zone = r;
                }
            }

            setEliminationMask(
                turf.difference(turf.featureCollection([world, zone])),
            );
        } catch (e) {
            console.error("Failed to compute zone mask:", e);
            toast.error("Could not render zone boundary");
        }
    }, [$mapGeoJSON, $questions]);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const cameraRef = useRef<CameraRef>(null);
    const mapRef = useRef<MapViewRef>(null);
    const insets = useSafeAreaInsets();
    const [userCoord, setUserCoord] = useState<[number, number] | null>(null);
    const [hasLocationPermission, setHasLocationPermission] = useState(false);
    const [zoneModalVisible, setZoneModalVisible] = useState(false);
    const [questionsVisible, setQuestionsVisible] = useState(false);
    const [isLoadingZone, setIsLoadingZone] = useState(false);

    // mapGeoLocation stores coordinates as [latitude, longitude] (non-standard GeoJSON).
    // MapLibre Camera expects [longitude, latitude].
    const initialCenter = useMemo<[number, number]>(
        () => [
            $mapGeoLocation.geometry.coordinates[1], // longitude
            $mapGeoLocation.geometry.coordinates[0], // latitude
        ],
        [$mapGeoLocation],
    );

    // Use Thunderforest when an API key is available — it authenticates per-request
    // and reliably serves high-zoom tiles from native apps. CartoDB's free CDN blocks
    // non-browser Referer headers at high zoom levels.
    const styleJSON = useMemo(
        () => buildStyleJSON(!!$thunderforestApiKey, $thunderforestApiKey),
        [$thunderforestApiKey],
    );

    const getMapCenter = useCallback(async (): Promise<
        [number, number] | null
    > => {
        try {
            const c = await mapRef.current?.getCenter(); // [lng, lat]
            return c ?? null;
        } catch {
            return null;
        }
    }, []);

    // True once the BottomSheet close animation has finished and map taps are safe to receive.
    const pickReadyRef = useRef(false);

    const handlePickLocationOnMap = useCallback((key: number) => {
        pickReadyRef.current = false;
        setPickingLocationForKey(key);
        setPendingCoord(null);
        setQuestionsVisible(false);
        // Allow map taps after the BottomSheet close animation completes (~300 ms).
        setTimeout(() => { pickReadyRef.current = true; }, 350);
        // editingQuestionKey will be cleared by onClose; re-set when pick finishes
    }, []);

    const finishPicking = useCallback((key: number) => {
        setPickingLocationForKey(null);
        setPendingCoord(null);
        setEditingQuestionKey(key); // re-set so initialEditKey prop restores Screen 3
        setQuestionsVisible(true);
    }, []);

    const zoomToUserLocation = useCallback(async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        cameraRef.current?.setCamera({
            centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
            zoomLevel: 13,
            animationMode: "flyTo",
            animationDuration: 800,
        });
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { status } =
                await Location.requestForegroundPermissionsAsync();
            if (status !== "granted" || cancelled) return;

            setHasLocationPermission(true);

            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            if (cancelled) return;

            cameraRef.current?.setCamera({
                centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
                zoomLevel: 13,
                animationMode: "flyTo",
                animationDuration: 800,
            });
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // Seed mapGeoJSON from the last saved boundary so the map renders immediately
    // before the Overpass API call completes. storageReady has already resolved
    // by the time MapView mounts, so getCached is a synchronous memStore lookup.
    useEffect(() => {
        const cached = getCached(BOUNDARY_CACHE_KEY);
        if (cached) {
            try {
                mapGeoJSON.set(JSON.parse(cached));
            } catch (e) {
                console.error("Failed to parse cached boundary:", e);
            }
        }
    }, []);

    // Re-fetch zone boundary whenever the selected location(s) change
    useEffect(() => {
        let cancelled = false;
        setIsLoadingZone(true);
        fetchAllZoneBoundaries()
            .then((boundary) => {
                if (cancelled) return;
                toast.success("Zone boundary loaded");
                // Defer the heavy nanostore update so the toast text gets a paint cycle
                // before the map re-render saturates the JS thread.
                requestAnimationFrame(() => {
                    if (cancelled) return;
                    mapGeoJSON.set(boundary);
                    setCached(BOUNDARY_CACHE_KEY, JSON.stringify(boundary));
                });
            })
            .catch((e) => {
                console.error("fetchAllZoneBoundaries failed:", e);
                toast.error("Could not load zone boundary");
            })
            .finally(() => {
                if (!cancelled) setIsLoadingZone(false);
            });
        return () => {
            cancelled = true;
        };
    }, [
        $mapGeoLocation.properties.osm_id,
        $additionalMapGeoLocations.length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        $additionalMapGeoLocations
            .map((x) => `${x.location.properties.osm_id}:${x.added}`)
            .join(","),
    ]);

    return (
        <View className="flex-1">
            <MLMapView
                ref={mapRef}
                style={styles.map}
                mapStyle={styleJSON}
                compassEnabled
                logoEnabled={false}
                attributionEnabled={false}
                onPress={(feature) => {
                    if (pickingLocationForKey === null || !pickReadyRef.current) return;
                    if (feature.geometry.type !== "Point") return;
                    const [lng, lat] = feature.geometry.coordinates as [
                        number,
                        number,
                    ];
                    setPendingCoord([lng, lat]);
                }}
            >
                <Camera
                    ref={cameraRef}
                    defaultSettings={{
                        centerCoordinate: initialCenter,
                        zoomLevel: 2,
                    }}
                />

                {hasLocationPermission && (
                    <UserLocation
                        visible={false}
                        onUpdate={(loc) =>
                            setUserCoord([
                                loc.coords.longitude,
                                loc.coords.latitude,
                            ])
                        }
                    />
                )}

                {userCoord && (
                    <MarkerView coordinate={userCoord}>
                        <UserLocationDot />
                    </MarkerView>
                )}

                {eliminationMask && (
                    <ShapeSource id="zone-mask" shape={eliminationMask}>
                        <FillLayer
                            id="zone-mask-fill"
                            style={{ fillColor: "#3388ff", fillOpacity: 0.2 }}
                        />
                        <LineLayer
                            id="zone-mask-line"
                            style={{
                                lineColor: "#3388ff",
                                lineWidth: 3,
                                lineOpacity: 1,
                            }}
                        />
                    </ShapeSource>
                )}

                {$questions
                    .filter((q) => q.id === "radius")
                    .map((q) => {
                        const circle = turf.circle(
                            [q.data.lng, q.data.lat],
                            q.data.radius,
                            {
                                units: q.data.unit,
                                steps: 64,
                            },
                        );
                        return (
                            <ShapeSource
                                key={q.key}
                                id={`radius-${q.key}`}
                                shape={circle}
                            >
                                <FillLayer
                                    id={`radius-fill-${q.key}`}
                                    style={{
                                        fillColor: colors.PRIMARY,
                                        fillOpacity: 0.08,
                                    }}
                                />
                                <LineLayer
                                    id={`radius-line-${q.key}`}
                                    style={{
                                        lineColor: colors.PRIMARY,
                                        lineWidth: 2,
                                        lineOpacity: 0.8,
                                    }}
                                />
                            </ShapeSource>
                        );
                    })}

                {$questions
                    .filter((q) => q.id === "radius")
                    .map((q) => (
                        <MarkerView
                            key={`m-${q.key}`}
                            coordinate={[q.data.lng, q.data.lat]}
                        >
                            <Pressable
                                onPress={() => {
                                    setEditingQuestionKey(q.key);
                                    setQuestionsVisible(true);
                                }}
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
                {pendingCoord && (
                    <MarkerView coordinate={pendingCoord}>
                        <View style={styles.pendingMarker}>
                            <Ionicons name="location" size={22} color="white" />
                        </View>
                    </MarkerView>
                )}
            </MLMapView>

            {/* Pick-location-on-map overlay */}
            {pickingLocationForKey !== null && (
                <View
                    style={[styles.pickingBanner, { top: insets.top + 16 }]}
                    pointerEvents="box-none"
                >
                    {pendingCoord === null ? (
                        // Phase 1: waiting for a tap
                        <>
                            <Ionicons
                                name="map-outline"
                                size={20}
                                color="white"
                            />
                            <Text style={styles.pickingBannerText}>
                                Tap the map to set location
                            </Text>
                            <Pressable
                                onPress={() =>
                                    finishPicking(pickingLocationForKey)
                                }
                                hitSlop={8}
                                className="active:opacity-70"
                            >
                                <Ionicons
                                    name="close-circle"
                                    size={26}
                                    color="white"
                                />
                            </Pressable>
                        </>
                    ) : (
                        // Phase 2: location tapped — confirm or re-tap
                        <>
                            <Text
                                style={[
                                    styles.pickingBannerText,
                                    { fontSize: 13 },
                                ]}
                            >
                                {`${Math.abs(pendingCoord[1]).toFixed(4)}° ${pendingCoord[1] >= 0 ? "N" : "S"}, ${Math.abs(pendingCoord[0]).toFixed(4)}° ${pendingCoord[0] >= 0 ? "E" : "W"}`}
                            </Text>
                            <Pressable
                                onPress={() => {
                                    const q = questions
                                        .get()
                                        .find(
                                            (x) =>
                                                x.key === pickingLocationForKey,
                                        );
                                    if (q?.id === "radius") {
                                        q.data.lng = pendingCoord[0];
                                        q.data.lat = pendingCoord[1];
                                        questionModified();
                                    }
                                    finishPicking(pickingLocationForKey);
                                }}
                                hitSlop={8}
                                style={styles.pickingConfirmBtn}
                                className="active:opacity-70"
                            >
                                <Text style={styles.pickingConfirmText}>
                                    Confirm
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => setPendingCoord(null)}
                                hitSlop={8}
                                className="active:opacity-70"
                            >
                                <Ionicons
                                    name="close-circle"
                                    size={26}
                                    color="white"
                                />
                            </Pressable>
                        </>
                    )}
                </View>
            )}

            {/* Questions button */}
            <Pressable
                onPress={() => setQuestionsVisible(true)}
                style={{ bottom: insets.bottom + 159 }}
                className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
                hitSlop={8}
            >
                <Ionicons
                    name="chatbox-ellipses-outline"
                    size={24}
                    color={colors.PRIMARY}
                />
            </Pressable>

            {/* Zone selector button — shows spinner while boundary is loading */}
            <Pressable
                onPress={() => setZoneModalVisible(true)}
                style={{ bottom: insets.bottom + 87 }}
                className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
                hitSlop={8}
            >
                {isLoadingZone ? (
                    <ActivityIndicator size="small" color={colors.PRIMARY} />
                ) : (
                    <Ionicons
                        name="map-outline"
                        size={24}
                        color={colors.PRIMARY}
                    />
                )}
            </Pressable>

            {/* Locate button */}
            <Pressable
                onPress={zoomToUserLocation}
                style={{ bottom: insets.bottom + 15 }}
                className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
                hitSlop={8}
            >
                <Ionicons
                    name="locate-outline"
                    size={24}
                    color={colors.PRIMARY}
                />
            </Pressable>

            <PlacePicker
                visible={zoneModalVisible}
                onClose={() => setZoneModalVisible(false)}
                onCustomLocation={() => {
                    setZoneModalVisible(false);
                    // TODO: open custom location flow
                }}
            />
            <QuestionsPanel
                visible={questionsVisible}
                onClose={() => {
                    setQuestionsVisible(false);
                    setEditingQuestionKey(null);
                }}
                getMapCenter={getMapCenter}
                userCoord={userCoord}
                initialEditKey={editingQuestionKey}
                onPickLocationOnMap={handlePickLocationOnMap}
            />
        </View>
    );
}

const DOT_SIZE = 16;
const RING_SIZE = DOT_SIZE;

const styles = StyleSheet.create({
    map: { flex: 1 },
    dotContainer: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        alignItems: "center",
        justifyContent: "center",
    },
    ring: {
        position: "absolute",
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        backgroundColor: colors.PRIMARY,
    },
    dotBorder: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    dot: {
        width: DOT_SIZE - 4,
        height: DOT_SIZE - 4,
        borderRadius: (DOT_SIZE - 4) / 2,
        backgroundColor: colors.PRIMARY,
    },
    pickingBanner: {
        position: "absolute",
        left: 16,
        right: 16,
        backgroundColor: colors.PRIMARY,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    pickingBannerText: {
        flex: 1,
        color: "white",
        fontSize: 15,
        fontWeight: "600",
    },
    pendingMarker: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#f97316", // orange to distinguish from confirmed marker
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
    pickingConfirmBtn: {
        backgroundColor: "white",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pickingConfirmText: {
        color: colors.PRIMARY,
        fontWeight: "700",
        fontSize: 14,
    },
    radiusMarker: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.PRIMARY,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 4,
    },
});
