import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';

import {
  additionalMapGeoLocations,
  mapGeoJSON,
  mapGeoLocation,
  polyGeoJSON,
  questions,
} from '../lib/context';
import { colors } from '../lib/colors';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OpenStreetMap } from '../../src/maps/api/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface PhotonFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    osm_id: number;
    osm_type: string;
    name: string;
    country?: string;
    state?: string;
    type: string;
    countrycode: string;
    osm_key: string;
    osm_value: string;
    extent?: [number, number, number, number];
  };
}

// ── Inline helpers (avoids transitive leaflet dependency from src/) ─────────

// Photon returns [lng, lat] — swap to [lat, lng] for nanostores.
// Extent: Photon [minLng, minLat, maxLng, maxLat] → store [maxLat, minLng, minLat, maxLng]
function swapCoords(feature: PhotonFeature): OpenStreetMap {
  const [lng, lat] = feature.geometry.coordinates;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lat, lng] },
    properties: {
      osm_type: feature.properties.osm_type as 'R' | 'W' | 'N',
      osm_id: feature.properties.osm_id,
      osm_key: feature.properties.osm_key,
      osm_value: feature.properties.osm_value,
      name: feature.properties.name,
      type: feature.properties.type,
      countrycode: feature.properties.countrycode,
      country: feature.properties.country,
      state: feature.properties.state,
      extent: feature.properties.extent
        ? [
            feature.properties.extent[1],
            feature.properties.extent[0],
            feature.properties.extent[3],
            feature.properties.extent[2],
          ]
        : undefined,
    },
  };
}

function determineName(loc: OpenStreetMap): string {
  const { name, state, country } = loc.properties;
  return [name, state, country].filter(Boolean).join(', ');
}

async function searchLocations(query: string): Promise<PhotonFeature[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    `https://photon.komoot.io/api/?lang=en&q=${encodeURIComponent(query)}&limit=10`,
  );
  const data = await res.json();
  const seen = new Set<number>();
  return (data.features as PhotonFeature[]).filter((f) => {
    if (f.properties.osm_type !== 'R') return false;
    if (seen.has(f.properties.osm_id)) return false;
    seen.add(f.properties.osm_id);
    return true;
  });
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onCustomLocation: () => void;
}

const SLIDE_DISTANCE = -700;

export function PlacePicker({ visible, onClose, onCustomLocation }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const $mapGeoLocation = useStore(mapGeoLocation);
  const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);

  // ── Animation ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideAnim.setValue(SLIDE_DISTANCE);
      backdropAnim.setValue(0);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 5,
            speed: 14,
          }),
          Animated.timing(backdropAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else if (mounted) {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: SLIDE_DISTANCE,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          setQuery('');
          setResults([]);
        }
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced search ─────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchLocations(query));
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Zone management ──────────────────────────────────────────────────────

  // `rowIndex` is the index in `selectedLocations` (0 = base, 1+ = additional).
  function handleToggleAdded(rowIndex: number) {
    const additionalIndex = rowIndex - 1;
    const current = additionalMapGeoLocations.get();
    additionalMapGeoLocations.set(
      current.map((item, i) => (i === additionalIndex ? { ...item, added: !item.added } : item)),
    );
    mapGeoJSON.set(null);
    polyGeoJSON.set(null);
    questions.set([...questions.get()]);
  }

  function handleRemove(rowIndex: number, isBase: boolean) {
    if (isBase) {
      const current = additionalMapGeoLocations.get();
      const firstAdded = current.find((x) => x.added === true);
      if (!firstAdded) {
        Alert.alert('Cannot remove', 'Please add another location in addition mode first.');
        return;
      }
      // Promote firstAdded to base: remove it from additionals, set as mapGeoLocation
      additionalMapGeoLocations.set(current.filter((x) => x !== firstAdded));
      mapGeoLocation.set(firstAdded.location);
    } else {
      const additionalIndex = rowIndex - 1;
      const current = additionalMapGeoLocations.get();
      additionalMapGeoLocations.set(current.filter((_, i) => i !== additionalIndex));
    }
    mapGeoJSON.set(null);
    polyGeoJSON.set(null);
    questions.set([...questions.get()]);
  }

  function handleSelectResult(feature: PhotonFeature) {
    additionalMapGeoLocations.set([
      ...additionalMapGeoLocations.get(),
      { added: true, location: swapCoords(feature), base: false },
    ]);
    mapGeoJSON.set(null);
    polyGeoJSON.set(null);
    questions.set([...questions.get()]);
    setQuery('');
  }

  function handleClearZone() {
    mapGeoJSON.set(null);
    polyGeoJSON.set(null);
    questions.set([]);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const selectedLocations = [
    { location: $mapGeoLocation, added: true, base: true },
    ...$additionalMapGeoLocations,
  ];

  // Duplicate-name disambiguation for search results
  const _placeLabels = results.map((r) => determineName(swapCoords(r)));
  const _placeLabelCounts: Record<string, number> = {};
  _placeLabels.forEach((l) => {
    _placeLabelCounts[l] = (_placeLabelCounts[l] || 0) + 1;
  });
  const _placeSeen: Record<string, number> = {};

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {/* Animated dim backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: backdropAnim, backgroundColor: 'rgba(0,0,0,0.4)' },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingTop: insets.top + 12, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 mb-3">
          <Text className="flex-1 text-xl font-semibold text-gray-800">Select zone</Text>
          <Pressable onPress={onClose} hitSlop={8} className="active:opacity-60">
            <Ionicons name="close" size={24} color="#555" />
          </Pressable>
        </View>

        {/* Selected locations */}
        {selectedLocations.map((item, rowIndex) => (
          <View
            key={`${item.location.properties.osm_id}-${rowIndex}`}
            style={[
              styles.locationRow,
              !item.base && !item.added ? styles.excludedRow : ""
            ]}
          >
            <Text className="flex-1 text-lg mr-2" style={{ color: item.added ? '#1f2937' : '#888888'}} numberOfLines={1}>
              {determineName(item.location)}
            </Text>
            <View style={styles.locationActions}>
              {!item.base && (
                <TouchableOpacity hitSlop={8} activeOpacity={0.6} onPress={() => handleToggleAdded(rowIndex)}>
                  <Ionicons
                    name={item.added ? 'checkmark-outline' : 'ban-outline'}
                    size={24}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity hitSlop={8} activeOpacity={0.6} onPress={() => handleRemove(rowIndex, item.base)}>
                <Ionicons name="trash-outline" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Separator */}
        <View className="h-px bg-gray-200 mx-4 my-2" />

        {/* Search bar */}
        <View className="mx-4 mb-3 flex flex-row items-center bg-gray-100 rounded-xl px-3 h-11">
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            className="flex-1 ml-2 text-gray-800 h-full"
            placeholder="Search for a location…"
            placeholderTextColor="#aaa"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => onClose()}
          />
          {loading && <ActivityIndicator size="small" color={colors.PRIMARY} />}
          {!loading && query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#aaa" />
            </Pressable>
          )}
        </View>

        {/* Search results */}
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.properties.osm_id}${item.properties.name}`}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => {
            const label = determineName(swapCoords(item));
            const seen = (_placeSeen[label] = (_placeSeen[label] || 0) + 1);
            const displayLabel = _placeLabelCounts[label] > 1 ? `${label} (${seen})` : label;
            return (
              <Pressable
                onPress={() => handleSelectResult(item)}
                className="flex-row items-center px-4 py-3 active:bg-gray-50"
              >
                <Ionicons name="location-outline" size={20} color={colors.PRIMARY} />
                <View className="ml-3 flex-1">
                  <Text className="text-base text-gray-800" numberOfLines={1}>
                    {displayLabel}
                  </Text>
                  {(item.properties.state || item.properties.country) ? (
                    <Text className="text-sm text-gray-400 mt-0.5" numberOfLines={1}>
                      {[item.properties.state, item.properties.country].filter(Boolean).join(', ')}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View className="h-px bg-gray-100 ml-14" />}
          ListEmptyComponent={
            query.length > 0 && !loading ? (
              <Text className="text-center text-gray-400 my-8">No results found</Text>
            ) : null
          }
        />

        {/* Footer buttons */}
        <View className="p-4 border-t border-gray-100 gap-2">
          <Pressable
            onPress={handleClearZone}
            className="flex-row items-center justify-center bg-gray-100 rounded-xl h-12 active:opacity-70"
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text className="ml-2 text-base font-medium text-red-500">Clear zone</Text>
          </Pressable>
          {/* TODO: Enable custom location ie. polygon selection */}
          {/* <Pressable
            onPress={onCustomLocation}
            className="flex-row items-center justify-center bg-gray-100 rounded-xl h-12 active:opacity-70"
          >
            <Ionicons name="pencil-outline" size={18} color={colors.PRIMARY} />
            <Text className="ml-2 text-base font-medium" style={{ color: colors.PRIMARY }}>
              Custom location
            </Text>
          </Pressable> */}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  list: {
    flexGrow: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  altRow: {
    backgroundColor: '#f9fafb',
  },
  excludedRow: {
    backgroundColor: '#e3e4e6',
  },
  locationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
