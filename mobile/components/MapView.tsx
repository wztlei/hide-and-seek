import {
  Camera,
  type CameraRef,
  MapView as MLMapView,
  MarkerView,
  setAccessToken,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@nanostores/react';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../lib/colors';
import { mapGeoLocation, thunderforestApiKey } from '../lib/context';
import { PlacePicker } from './PlacePicker';

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

function UserLocationDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.15, 0] });

  return (
    <View style={styles.dotContainer}>
      {/* Pulsing ring */}
      <Animated.View
        style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
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
  const $thunderforestApiKey = useStore(thunderforestApiKey);
  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const [userCoord, setUserCoord] = useState<[number, number] | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [zoneModalVisible, setZoneModalVisible] = useState(false);

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

  const zoomToUserLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    cameraRef.current?.setCamera({
      centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
      zoomLevel: 13,
      animationMode: 'flyTo',
      animationDuration: 800,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      setHasLocationPermission(true);

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (cancelled) return;

      cameraRef.current?.setCamera({
        centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
        zoomLevel: 13,
        animationMode: 'flyTo',
        animationDuration: 800,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1">
      <MLMapView
        style={styles.map}
        mapStyle={styleJSON}
        compassEnabled
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: initialCenter, zoomLevel: 2 }}
        />

        {hasLocationPermission && (
          <UserLocation
            visible={false}
            onUpdate={(loc) =>
              setUserCoord([loc.coords.longitude, loc.coords.latitude])
            }
          />
        )}

        {userCoord && (
          <MarkerView coordinate={userCoord}>
            <UserLocationDot />
          </MarkerView>
        )}
      </MLMapView>

      {/* Zone selector button */}
      <Pressable
        onPress={() => setZoneModalVisible(true)}
        style={{ bottom: insets.bottom + 87 }}
        className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
        hitSlop={8}
      >
        <Ionicons name="map-outline" size={24} color={colors.PRIMARY} />
      </Pressable>

      {/* Locate button */}
      <Pressable
        onPress={zoomToUserLocation}
        style={{ bottom: insets.bottom + 15 }}
        className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
        hitSlop={8}
      >
        <Ionicons name="locate-outline" size={24} color={colors.PRIMARY} />
      </Pressable>

      <PlacePicker
        visible={zoneModalVisible}
        onClose={() => setZoneModalVisible(false)}
        onCustomLocation={() => {
          setZoneModalVisible(false);
          // TODO: open custom location flow
        }}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.PRIMARY,
  },
  dotBorder: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
});
