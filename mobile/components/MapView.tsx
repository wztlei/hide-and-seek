import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView as MLMapView,
  PointAnnotation,
  ShapeSource,
  setAccessToken,
} from '@maplibre/maplibre-react-native';
import { useStore } from '@nanostores/react';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import type { FeatureCollection } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { applyQuestionsToMapGeoData, hiderifyQuestion, holedMask } from '../../src/maps';
import { determineMapBoundaries } from '../../src/maps/api';
import {
  animateMapMovements,
  autoZoom,
  followMe,
  hiderMode,
  highlightTrainLines,
  isLoading,
  mapGeoJSON,
  mapGeoLocation,
  planningModeEnabled,
  polyGeoJSON,
  questionFinishedMapData,
  questions,
  thunderforestApiKey,
  triggerLocalRefresh,
} from '../lib/context';
import { toast } from '../lib/notifications';
import { DraggableMarkers } from './DraggableMarker';
import { MapContextMenu } from './MapContextMenu';

// MapLibre doesn't need a Mapbox token when using OSM tiles
setAccessToken(null);

function buildStyleJSON(useThunderforest: boolean, apiKey: string): string {
  if (useThunderforest && apiKey) {
    return JSON.stringify({
      version: 8,
      sources: {
        thunderforest: {
          type: 'raster',
          tiles: [`https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${apiKey}`],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © Thunderforest',
        },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#f8f4f0' } },
        { id: 'tiles', type: 'raster', source: 'thunderforest' },
      ],
    });
  }
  return JSON.stringify({
    version: 8,
    sources: {
      cartodb: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#f8f4f0' } },
      { id: 'tiles', type: 'raster', source: 'cartodb' },
    ],
  });
}

export function AppMapView() {
  const $questions = useStore(questions);
  const $mapGeoLocation = useStore(mapGeoLocation);
  const $thunderforestApiKey = useStore(thunderforestApiKey);
  const $hiderMode = useStore(hiderMode);
  const $followMe = useStore(followMe);
  const $isLoading = useStore(isLoading);
  useStore(triggerLocalRefresh); // force re-render on manual refresh

  // Per-question intermediate GeoJSON layers (planning mode / debug)
  const [questionLayers, setQuestionLayers] = useState<FeatureCollection[]>([]);
  // The positive result layer — blue fill showing where the hider can be
  const [resultLayer, setResultLayer] = useState<FeatureCollection | null>(null);
  // The dark elimination mask overlay
  const [eliminationLayer, setEliminationLayer] = useState<FeatureCollection | null>(null);
  // GPS dot position [lng, lat]
  const [gpsCoords, setGpsCoords] = useState<[number, number] | null>(null);
  // Long-press context menu
  const [contextVisible, setContextVisible] = useState(false);
  const [contextCoord, setContextCoord] = useState<[number, number] | null>(null);

  const cameraRef = useRef<InstanceType<typeof Camera>>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const refreshingRef = useRef(false);

  // mapGeoLocation stores coordinates as [latitude, longitude] (non-standard GeoJSON).
  // MapLibre Camera expects [longitude, latitude].
  // Memoized so the Camera prop reference is stable — a new array on every render
  // would make MapLibre think the target changed and snap back to this position.
  const initialCenter = useMemo<[number, number]>(
    () => [
      $mapGeoLocation.geometry.coordinates[1], // longitude
      $mapGeoLocation.geometry.coordinates[0], // latitude
    ],
    [$mapGeoLocation],
  );

  const refreshQuestions = useCallback(
    async (focus: boolean) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      isLoading.set(true);

      try {
        let mapGeoData = mapGeoJSON.get();

        if (!mapGeoData) {
          const polyData = polyGeoJSON.get();
          if (polyData) {
            mapGeoData = polyData;
            mapGeoJSON.set(polyData);
          } else {
            try {
              mapGeoData = await determineMapBoundaries();
              mapGeoJSON.set(mapGeoData);
            } catch {
              toast.error('Error loading map boundaries');
              return;
            }
          }
        }

        if ($hiderMode !== false) {
          for (const question of $questions) {
            await hiderifyQuestion(question);
          }
          triggerLocalRefresh.set(Math.random());
        }

        const newLayers: FeatureCollection[] = [];

        const finalData = await applyQuestionsToMapGeoData(
          $questions,
          mapGeoData,
          planningModeEnabled.get(),
          (geoJSONObj) => {
            newLayers.push(geoJSONObj);
          },
        );

        setQuestionLayers(newLayers);

        // Render the positive result (where hider can be) with blue fill
        setResultLayer(finalData ?? null);

        const mask = finalData ? holedMask(finalData) : null;
        const maskCollection: FeatureCollection | null = mask
          ? { type: 'FeatureCollection', features: [mask] }
          : null;

        setEliminationLayer(maskCollection);
        questionFinishedMapData.set(maskCollection);

        if (autoZoom.get() && focus && mask) {
          const bbox = turf.bbox(mask);
          cameraRef.current?.setCamera({
            bounds: {
              ne: [bbox[2], bbox[3]], // [maxLng, maxLat]
              sw: [bbox[0], bbox[1]], // [minLng, minLat]
              paddingTop: 48,
              paddingBottom: 48,
              paddingLeft: 48,
              paddingRight: 48,
            },
            animationMode: animateMapMovements.get() ? 'flyTo' : 'none',
            animationDuration: animateMapMovements.get() ? 800 : 0,
          });
        }
      } catch (err) {
        console.error('[MapView] refreshQuestions error:', err);
        toast.error('No solutions found / error occurred');
      } finally {
        isLoading.set(false);
        refreshingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [$questions, $hiderMode],
  );

  // Refresh map data when questions or hider mode change
  useEffect(() => {
    refreshQuestions(true);
  }, [$questions, $hiderMode, refreshQuestions]);

  // GPS follow-me
  useEffect(() => {
    if (!$followMe) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      setGpsCoords(null);
      return;
    }

    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.error('Unable to access your location.');
        followMe.set(false);
        return;
      }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (pos) => {
          if (!active) return;
          setGpsCoords([pos.coords.longitude, pos.coords.latitude]);
        },
      );
      if (active) {
        locationSubRef.current = sub;
      } else {
        sub.remove();
      }
    })();

    return () => {
      active = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [$followMe]);

  const handleLongPress = useCallback((event: any) => {
    const coords = event.geometry?.coordinates as [number, number] | undefined;
    if (coords) {
      setContextCoord(coords);
      setContextVisible(true);
    }
  }, []);

  // Use Thunderforest when an API key is available — it authenticates per-request
  // and reliably serves high-zoom tiles from native apps. CartoDB's free CDN blocks
  // non-browser Referer headers at high zoom levels.
  const styleJSON = useMemo(
    () => buildStyleJSON(!!$thunderforestApiKey, $thunderforestApiKey),
    [$thunderforestApiKey],
  );

  return (
    <View style={styles.container}>
      <MLMapView
        style={styles.map}
        mapStyle={styleJSON}
        onLongPress={handleLongPress}
        compassEnabled
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Camera
          ref={cameraRef}
          centerCoordinate={initialCenter}
          zoomLevel={5}
          animationMode="none"
        />

        {/* Blue fill — positive result showing where hider can be */}
        {resultLayer && (
          <ShapeSource id="result" shape={resultLayer}>
            <FillLayer
              id="result-fill"
              style={{ fillColor: '#2A81CB', fillOpacity: 0.3 }}
            />
            <LineLayer
              id="result-line"
              style={{ lineColor: '#2A81CB', lineWidth: 1.5, lineOpacity: 0.8 }}
            />
          </ShapeSource>
        )}

        {/* Per-question intermediate layers (planning mode) */}
        {questionLayers.map((geojson, i) => (
          <ShapeSource key={`ql-${i}`} id={`ql-${i}`} shape={geojson}>
            <FillLayer
              id={`ql-fill-${i}`}
              style={{ fillColor: 'rgba(42,129,203,0.25)', fillOpacity: 1 }}
            />
            <LineLayer
              id={`ql-line-${i}`}
              style={{ lineColor: '#2A81CB', lineWidth: 1.5, lineOpacity: 0.8 }}
            />
          </ShapeSource>
        ))}

        {/* Elimination mask — dark overlay on excluded areas */}
        {eliminationLayer && (
          <ShapeSource id="elimination" shape={eliminationLayer}>
            <FillLayer
              id="elimination-fill"
              style={{ fillColor: '#1a1a2e', fillOpacity: 0.5 }}
            />
          </ShapeSource>
        )}

        {/* GPS dot */}
        {gpsCoords && (
          <ShapeSource id="gps-loc" shape={turf.point(gpsCoords)}>
            <CircleLayer
              id="gps-circle"
              style={{
                circleColor: '#2A81CB',
                circleRadius: 8,
                circleStrokeColor: 'white',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}

        {/* Draggable question markers */}
        <DraggableMarkers />
      </MLMapView>

      {/* Loading spinner */}
      {$isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#2A81CB" />
        </View>
      )}

      {/* Long-press context menu */}
      <MapContextMenu
        visible={contextVisible}
        coordinate={contextCoord}
        onClose={() => setContextVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
