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
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Questions } from "../../src/maps/schema";
import {
    hidingRadius,
    hidingRadiusUnits,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questionModified,
    questions,
    thunderforestApiKey,
} from "../lib/context";
import { draftQuestion } from "../lib/draftQuestion";
import { useEliminationMask } from "../hooks/useEliminationMask";
import { useHidingZones } from "../hooks/useHidingZones";
import { useUpdateCheck } from "../hooks/useUpdateCheck";
import { useUserLocation } from "../hooks/useUserLocation";
import { useZoneBoundary } from "../hooks/useZoneBoundary";
import { MapActionButtons } from "./map/MapActionButtons";
import { DrawPolygonBanner } from "./map/DrawPolygonBanner";
import { HidingZonePoiPrompt } from "./map/HidingZonePoiPrompt";
import { MapLayers } from "./map/MapLayers";
import { MapLoadingOverlay } from "./map/MapLoadingOverlay";
import { PickLocationBanner } from "./map/PickLocationBanner";
import { MapConfigPanel } from "./MapConfigPanel";
import { QuestionsPanel } from "./QuestionsPanel";
import { SettingsSheet } from "./SettingsSheet";

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
    const { hasUpdate, latestVersion, storeUrl } = useUpdateCheck();
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
    const {
        hidingZoneCircles,
        hidingZoneMask,
        hidingZonePois,
        isLoading: isLoadingHidingZones,
    } = useHidingZones({
        zoneBoundary,
    });

    // ── UI state ────────────────────────────────────────────────────────────
    const [editingQuestionKey, setEditingQuestionKey] = useState<number | null>(
        null,
    );
    const [questionsVisible, setQuestionsVisible] = useState(false);
    const [zoneModalVisible, setZoneModalVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);

    // ── Polygon drawing state ────────────────────────────────────────────────
    const [drawingPolygon, setDrawingPolygon] = useState(false);
    const [polygonVertices, setPolygonVertices] = useState<[number, number][]>([]);

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

    // Hiding zone POI tap — coord of the tapped stop (null = prompt hidden)
    const [pendingHidingZonePoi, setPendingHidingZonePoi] = useState<[number, number] | null>(null);
    // Prevents the map's onPress from immediately dismissing the prompt that
    // the ShapeSource onPress just set (both fire on the same tap).
    const poiJustTappedRef = useRef(false);

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

    const handleHidingZonePoiPress = useCallback((coord: [number, number]) => {
        // Set the guard flag before MapView.onPress can fire (or to absorb it
        // if ShapeSource fires first). Clear it after the current event batch
        // so it doesn't swallow a subsequent map tap to dismiss the prompt.
        poiJustTappedRef.current = true;
        setTimeout(() => { poiJustTappedRef.current = false; }, 0);
        setPendingHidingZonePoi(coord);
    }, []);

    const handleCompletePolygon = useCallback((vertices: [number, number][]) => {
        if (vertices.length < 3) return;
        const ring = [...vertices, vertices[0]];
        const polygon: Feature<Polygon> = {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { added: true },
        };
        const existing = polyGeoJSON.get();
        const fc: FeatureCollection<Polygon | MultiPolygon> = {
            type: "FeatureCollection",
            features: existing ? [...existing.features, polygon] : [polygon],
        };
        polyGeoJSON.set(fc);
        mapGeoJSON.set(null); // trigger useZoneBoundary refetch with new polygon list
        setDrawingPolygon(false);
        setPolygonVertices([]);
    }, []);

    const handleCancelDrawPolygon = useCallback(() => {
        setDrawingPolygon(false);
        setPolygonVertices([]);
    }, []);

    const handleStartDrawPolygon = useCallback(() => {
        setDrawingPolygon(true);
        setPolygonVertices([]);
    }, []);

    const handleConfirmHidingZone = useCallback(() => {
        if (!pendingHidingZonePoi) return;
        const [lng, lat] = pendingHidingZonePoi;
        const newQuestion = {
            id: "radius" as const,
            key: Date.now(),
            data: {
                lat,
                lng,
                radius: hidingRadius.get(),
                unit: hidingRadiusUnits.get() as "miles" | "kilometers",
                within: true,
                drag: true,
                color: "green" as const,
                collapsed: false,
            },
        };
        questions.set([...questions.get(), newQuestion]);
        questionModified();
        setPendingHidingZonePoi(null);
    }, [pendingHidingZonePoi]);

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
                    // Absorb the MapView tap that fires on the same event as a
                    // POI dot press. The flag is cleared via setTimeout(0) in
                    // handleHidingZonePoiPress after the event batch completes.
                    if (poiJustTappedRef.current) return;

                    if (feature.geometry.type !== "Point") return;
                    const [lng, lat] = feature.geometry.coordinates as [number, number];

                    // Drawing mode: collect vertices; close polygon if near first vertex.
                    if (drawingPolygon) {
                        if (polygonVertices.length >= 3) {
                            const [fx, fy] = polygonVertices[0];
                            const dLng = lng - fx;
                            const dLat = lat - fy;
                            if (Math.sqrt(dLng * dLng + dLat * dLat) < 0.001) {
                                handleCompletePolygon(polygonVertices);
                                return;
                            }
                        }
                        setPolygonVertices((prev) => [...prev, [lng, lat] as [number, number]]);
                        return;
                    }

                    // Dismiss the POI prompt on any tap elsewhere.
                    if (pendingHidingZonePoi !== null) {
                        setPendingHidingZonePoi(null);
                        return;
                    }

                    if (pickingLocationForKey === null || !pickReadyRef.current) return;
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
                    isPickMode={pickingLocationForKey !== null}
                    hidingZoneCircles={hidingZoneCircles}
                    hidingZoneMask={hidingZoneMask}
                    hidingZonePois={hidingZonePois}
                    onHidingZonePoiPress={handleHidingZonePoiPress}
                    selectedHidingZonePoi={pendingHidingZonePoi}
                    drawingPolygon={drawingPolygon}
                    polygonVertices={polygonVertices}
                />
            </MLMapView>

            {(isComputingLayers || isLoadingHidingZones) && (
                <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                    <View
                        className="bg-white rounded-[20px] p-2.5"
                        style={{
                            shadowColor: "#000",
                            shadowOpacity: 0.12,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: 4,
                        }}
                    >
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

            {pendingHidingZonePoi !== null && pickingLocationForKey === null && (
                <HidingZonePoiPrompt
                    topInset={insets.top}
                    onConfirm={handleConfirmHidingZone}
                    onDismiss={() => setPendingHidingZonePoi(null)}
                />
            )}

            {drawingPolygon && pickingLocationForKey === null && (
                <DrawPolygonBanner
                    topInset={insets.top}
                    vertexCount={polygonVertices.length}
                    onFinish={() => handleCompletePolygon(polygonVertices)}
                    onCancel={handleCancelDrawPolygon}
                />
            )}

            <View pointerEvents={drawingPolygon ? "none" : "auto"}>
                <MapActionButtons
                    bottomInset={insets.bottom}
                    isLoadingZone={isLoadingZone}
                    hasUpdate={hasUpdate}
                    onQuestionsPress={() => setQuestionsVisible(true)}
                    onZonePress={() => setZoneModalVisible(true)}
                    onLocatePress={zoomToUserLocation}
                    onSettingsPress={() => setSettingsVisible(true)}
                />
            </View>

            <MapConfigPanel
                visible={zoneModalVisible}
                onClose={() => setZoneModalVisible(false)}
                onCustomLocation={() => {
                    setZoneModalVisible(false);
                }}
                onStartDrawPolygon={handleStartDrawPolygon}
            />

            <QuestionsPanel
                visible={questionsVisible}
                onClose={handleQuestionsClose}
                getMapCenter={getMapCenter}
                userCoord={userCoord}
                initialEditKey={editingQuestionKey}
                onPickLocationOnMap={handlePickLocationOnMap}
            />

            <SettingsSheet
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                hasUpdate={hasUpdate}
                latestVersion={latestVersion}
                storeUrl={storeUrl}
            />

            {!$mapGeoJSON && <MapLoadingOverlay />}
        </View>
    );
}

const styles = { map: { flex: 1 } } as const;
