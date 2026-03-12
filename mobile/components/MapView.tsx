import {
    Camera,
    type CameraRef,
    MapView as MLMapView,
    type MapViewRef,
    UserLocation,
    setAccessToken,
} from "@maplibre/maplibre-react-native";
import { useStore } from "@nanostores/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Questions } from "../../src/maps/schema";
import {
    mapGeoJSON,
    mapGeoLocation,
    questionModified,
    questions,
    thunderforestApiKey,
} from "../lib/context";
import { draftQuestion } from "../lib/draftQuestion";
import { useEliminationMask } from "../hooks/useEliminationMask";
import { useUserLocation } from "../hooks/useUserLocation";
import { useZoneBoundary } from "../hooks/useZoneBoundary";
import { MapActionButtons } from "./map/MapActionButtons";
import { MapLayers } from "./map/MapLayers";
import { MapLoadingOverlay } from "./map/MapLoadingOverlay";
import { PickLocationBanner } from "./map/PickLocationBanner";
import { PlacePicker } from "./PlacePicker";
import { QuestionsPanel } from "./QuestionsPanel";

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

/**
 * Root map screen. Coordinates state and wires together sub-components and
 * hooks. See mobile/components/map/CLAUDE.md for the full architecture overview.
 */
export function AppMapView() {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $mapGeoJSON = useStore(mapGeoJSON);
    const $questions = useStore(questions) as Questions;
    const $thunderforestApiKey = useStore(thunderforestApiKey);

    const cameraRef = useRef<CameraRef>(null);
    const mapRef = useRef<MapViewRef>(null);
    const insets = useSafeAreaInsets();

    // ── Custom hooks ────────────────────────────────────────────────────────
    const {
        eliminationMask,
        zoneBoundary,
        radiusRegions,
        thermometerRegions,
        tentaclesRegions,
        matchingRegions,
        measuringRegions,
        isComputingLayers,
    } = useEliminationMask();
    const { isLoadingZone } = useZoneBoundary();
    const {
        userCoord,
        hasLocationPermission,
        zoomToUserLocation,
        handleLocationUpdate,
    } = useUserLocation(cameraRef);

    // ── UI state ────────────────────────────────────────────────────────────
    const [editingQuestionKey, setEditingQuestionKey] = useState<number | null>(
        null,
    );
    const [questionsVisible, setQuestionsVisible] = useState(false);
    const [zoneModalVisible, setZoneModalVisible] = useState(false);

    // ── Pick-location-on-map state ──────────────────────────────────────────
    // pickingLocationForKey: which question is being edited (non-null = active)
    // pickingLocationField:  "A" or "B" for thermometer; null for radius
    // pendingCoord:          the coord the user tapped (null until tapped)
    const [pickingLocationForKey, setPickingLocationForKey] = useState<
        number | null
    >(null);
    const [pickingLocationField, setPickingLocationField] = useState<
        "A" | "B" | null
    >(null);
    const [pendingCoord, setPendingCoord] = useState<[number, number] | null>(
        null,
    );
    // Guards map taps until the bottom sheet close animation fully completes.
    // The sheet's gesture recognizer stays active during the animation and
    // consumes touches — we use a fixed timeout rather than onChange since
    // the Reanimated animation runs on the UI thread but onChange fires on
    // the JS thread with an unpredictable delay.
    const pickReadyRef = useRef(false);
    const pickReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Derived ─────────────────────────────────────────────────────────────

    // mapGeoLocation stores coordinates as [latitude, longitude] (non-standard).
    // MapLibre Camera expects [longitude, latitude].
    const initialCenter = useMemo<[number, number]>(
        () => [
            $mapGeoLocation.geometry.coordinates[1], // longitude
            $mapGeoLocation.geometry.coordinates[0], // latitude
        ],
        [$mapGeoLocation],
    );

    const styleJSON = useMemo(
        () => buildStyleJSON(!!$thunderforestApiKey, $thunderforestApiKey),
        [$thunderforestApiKey],
    );

    // ── Callbacks ───────────────────────────────────────────────────────────

    // Cached map center — initialised to the zone centre so it's always
    // synchronously available. Refreshed in the background whenever called
    // so future calls return a more accurate position.
    const mapCenterRef = useRef<[number, number]>(initialCenter);

    const getMapCenter = useCallback((): [number, number] => {
        mapRef.current
            ?.getCenter()
            .then((c) => {
                if (c) mapCenterRef.current = c as [number, number];
            })
            .catch(() => {});
        return mapCenterRef.current;
    }, []);

    /** Opens pick-mode: closes the panel and waits for a map tap. */
    const handlePickLocationOnMap = useCallback(
        (key: number, field?: "A" | "B") => {
            console.log("[pickMode] entering pick mode — key:", key, "field:", field);
            pickReadyRef.current = false;
            if (pickReadyTimerRef.current) clearTimeout(pickReadyTimerRef.current);
            setPickingLocationForKey(key);
            setPickingLocationField(field ?? null);
            setPendingCoord(null);
            setQuestionsVisible(false);
            setEditingQuestionKey(null);
            // Allow taps after the sheet close animation has had time to finish.
            // 550 ms comfortably exceeds the default spring animation duration.
            pickReadyTimerRef.current = setTimeout(() => {
                pickReadyRef.current = true;
                console.log("[pickMode] pickReady = true");
            }, 550);
        },
        [],
    );

    const handleQuestionsClose = useCallback(() => {
        setQuestionsVisible(false);
        setEditingQuestionKey(null);
    }, []);

    /** Exits pick-mode and reopens the edit panel for the given question. */
    const finishPicking = useCallback((key: number) => {
        setPickingLocationForKey(null);
        setPickingLocationField(null);
        setPendingCoord(null);
        setEditingQuestionKey(key); // re-set so initialEditKey prop restores Screen 3
        setQuestionsVisible(true);
    }, []);

    /** Writes the confirmed coord to the question data and exits pick-mode. */
    const handleConfirmPick = useCallback(() => {
        if (pendingCoord === null || pickingLocationForKey === null) return;

        // Draft questions live outside the store — update the atom directly.
        const draft = draftQuestion.get();
        if (draft && draft.key === pickingLocationForKey) {
            const updated = {
                ...draft,
                data: { ...draft.data },
            } as typeof draft;
            if (draft.id === "thermometer") {
                if (pickingLocationField === "A") {
                    (updated.data as any).lngA = pendingCoord[0];
                    (updated.data as any).latA = pendingCoord[1];
                } else {
                    (updated.data as any).lngB = pendingCoord[0];
                    (updated.data as any).latB = pendingCoord[1];
                }
            } else if (
                draft.id === "measuring" &&
                pickingLocationField === "B"
            ) {
                (updated.data as any).poiSearchLng = pendingCoord[0];
                (updated.data as any).poiSearchLat = pendingCoord[1];
            } else {
                (updated.data as any).lng = pendingCoord[0];
                (updated.data as any).lat = pendingCoord[1];
            }
            draftQuestion.set(updated);
            finishPicking(pickingLocationForKey);
            return;
        }

        const q = (questions.get() as Questions).find(
            (x) => x.key === pickingLocationForKey,
        );
        if (q?.id === "radius") {
            q.data.lng = pendingCoord[0];
            q.data.lat = pendingCoord[1];
            questionModified();
        } else if (q?.id === "tentacles") {
            q.data.lng = pendingCoord[0];
            q.data.lat = pendingCoord[1];
            questionModified();
        } else if (q?.id === "matching") {
            q.data.lng = pendingCoord[0];
            q.data.lat = pendingCoord[1];
            questionModified();
        } else if (q?.id === "measuring") {
            if (pickingLocationField === "B") {
                (q.data as any).poiSearchLng = pendingCoord[0];
                (q.data as any).poiSearchLat = pendingCoord[1];
            } else {
                q.data.lng = pendingCoord[0];
                q.data.lat = pendingCoord[1];
            }
            questionModified();
        } else if (q?.id === "thermometer") {
            if (pickingLocationField === "A") {
                q.data.lngA = pendingCoord[0];
                q.data.latA = pendingCoord[1];
            } else {
                q.data.lngB = pendingCoord[0];
                q.data.latB = pendingCoord[1];
            }
            questionModified();
        }
        finishPicking(pickingLocationForKey);
    }, [
        pendingCoord,
        pickingLocationForKey,
        pickingLocationField,
        finishPicking,
    ]);

    const handleMarkerPress = useCallback((key: number) => {
        setEditingQuestionKey(key);
        setQuestionsVisible(true);
    }, []);

    // ── Render ──────────────────────────────────────────────────────────────

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
                    console.log("[mapPress] fired — pickingLocationForKey:", pickingLocationForKey, "geomType:", feature.geometry.type);
                    if (pickingLocationForKey === null || !pickReadyRef.current) {
                        console.log("[mapPress] ignored — pickingLocationForKey:", pickingLocationForKey, "pickReady:", pickReadyRef.current);
                        return;
                    }
                    if (feature.geometry.type !== "Point") {
                        console.log("[mapPress] ignored — geometry is not Point");
                        return;
                    }
                    const [lng, lat] = feature.geometry.coordinates as [
                        number,
                        number,
                    ];
                    console.log("[mapPress] accepted — setting pendingCoord", lng, lat);
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
                        onUpdate={handleLocationUpdate}
                    />
                )}

                <MapLayers
                    eliminationMask={eliminationMask}
                    zoneBoundary={zoneBoundary}
                    radiusRegions={radiusRegions}
                    thermometerRegions={thermometerRegions}
                    tentaclesRegions={tentaclesRegions}
                    matchingRegions={matchingRegions}
                    measuringRegions={measuringRegions}
                    questions={$questions}
                    userCoord={userCoord}
                    pendingCoord={pendingCoord}
                    onMarkerPress={handleMarkerPress}
                />
            </MLMapView>

            {isComputingLayers && (
                <View style={styles.mapSpinner} pointerEvents="none">
                    <View style={styles.mapSpinnerPill}>
                        <ActivityIndicator size="small" color="#4f46e5" />
                    </View>
                </View>
            )}

            {pickingLocationForKey !== null && (
                <PickLocationBanner
                    pendingCoord={pendingCoord}
                    topInset={insets.top}
                    onCancel={() => finishPicking(pickingLocationForKey)}
                    onConfirm={handleConfirmPick}
                    onRetap={() => setPendingCoord(null)}
                />
            )}

            <MapActionButtons
                bottomInset={insets.bottom}
                isLoadingZone={isLoadingZone}
                onQuestionsPress={() => setQuestionsVisible(true)}
                onZonePress={() => setZoneModalVisible(true)}
                onLocatePress={zoomToUserLocation}
            />

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
                onClose={handleQuestionsClose}
                getMapCenter={getMapCenter}
                userCoord={userCoord}
                initialEditKey={editingQuestionKey}
                onPickLocationOnMap={handlePickLocationOnMap}
            />

            {!$mapGeoJSON && <MapLoadingOverlay />}
        </View>
    );
}

const styles = StyleSheet.create({
    map: { flex: 1 },
    mapSpinner: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
    },
    mapSpinnerPill: {
        backgroundColor: "rgba(255,255,255, 1)",
        borderRadius: 20,
        padding: 10,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
});
