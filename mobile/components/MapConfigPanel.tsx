import * as Sentry from "@sentry/react-native";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    additionalMapGeoLocations,
    displayHidingZones,
    displayHidingZonesOptions,
    hidingRadius,
    hidingRadiusUnits,
    mapGeoJSON,
    mapGeoLocation,
    mergeDuplicates,
    polyGeoJSON,
    questions,
    showHidingZoneCircles,
} from "../lib/context";
import { colors } from "../lib/colors";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import type { OpenStreetMap } from "../../src/maps/api/types";

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

// ── Transit type options ───────────────────────────────────────────────────

const TRANSIT_OPTIONS: { tag: string; label: string }[] = [
    { tag: "[railway=station]", label: "Railway Stations" },
    { tag: "[railway=halt]", label: "Railway Halts" },
    { tag: "[station=subway]", label: "Subway Stations" },
    { tag: "[station=light_rail]", label: "Light Rail" },
    { tag: "[highway=bus_stop]", label: "Bus Stops" },
    { tag: "[amenity=bus_station]", label: "Bus Stations" },
];

// ── Inline helpers (avoids transitive leaflet dependency from src/) ─────────

// Photon returns [lng, lat] — swap to [lat, lng] for nanostores.
// Extent: Photon [minLng, minLat, maxLng, maxLat] → store [maxLat, minLng, minLat, maxLng]
function swapCoords(feature: PhotonFeature): OpenStreetMap {
    const [lng, lat] = feature.geometry.coordinates;
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lat, lng] },
        properties: {
            osm_type: feature.properties.osm_type as "R" | "W" | "N",
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
    return [name, state, country].filter(Boolean).join(", ");
}

async function searchLocations(query: string): Promise<PhotonFeature[]> {
    if (!query.trim()) return [];
    try {
        const res = await fetch(
            `https://photon.komoot.io/api/?lang=en&q=${encodeURIComponent(query)}&limit=10`,
        );
        if (!res.ok) throw new Error(`Photon search ${res.status}`);
        const data = await res.json();
        const seen = new Set<number>();
        return (data.features as PhotonFeature[]).filter((f) => {
            if (f.properties.osm_type !== "R") return false;
            if (seen.has(f.properties.osm_id)) return false;
            seen.add(f.properties.osm_id);
            return true;
        });
    } catch (err) {
        Sentry.captureException(err, { tags: { location: "searchLocations" } });
        return [];
    }
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
    visible: boolean;
    onClose: () => void;
    onCustomLocation: () => void;
    onStartDrawPolygon: () => void;
}

export function MapConfigPanel({ visible, onClose, onCustomLocation: _onCustomLocation, onStartDrawPolygon }: Props) {
    const posthog = usePostHog();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const isProgrammaticCloseRef = useRef(false);

    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PhotonFeature[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hiding zone state
    const [hidingRadiusText, setHidingRadiusText] = useState<string>("");

    const $mapGeoLocation = useStore(mapGeoLocation);
    const $additionalMapGeoLocations = useStore(additionalMapGeoLocations);
    const $polyGeoJSON = useStore(polyGeoJSON);
    const $displayHidingZones = useStore(displayHidingZones);
    const $displayHidingZonesOptions = useStore(displayHidingZonesOptions);
    const $hidingRadius = useStore(hidingRadius);
    const $hidingRadiusUnits = useStore(hidingRadiusUnits);
    const $showHidingZoneCircles = useStore(showHidingZoneCircles);
    const $mergeDuplicates = useStore(mergeDuplicates);

    // Sync text input with atom
    useEffect(() => {
        setHidingRadiusText(String($hidingRadius));
    }, [$hidingRadius]);

    // ── Bottom sheet open/close ───────────────────────────────────────────────

    useEffect(() => {
        if (visible) {
            isProgrammaticCloseRef.current = false;
            sheetRef.current?.expand();
        } else {
            isProgrammaticCloseRef.current = true;
            sheetRef.current?.close();
            setQuery("");
            setResults([]);
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSheetChange = useCallback(
        (index: number) => {
            if (index === -1 && !isProgrammaticCloseRef.current) {
                onClose();
            }
        },
        [onClose],
    );

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
            />
        ),
        [],
    );

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

    function handleToggleAdded(rowIndex: number) {
        const additionalIndex = rowIndex - 1;
        const current = additionalMapGeoLocations.get();
        const newAdded = !current[additionalIndex]?.added;
        additionalMapGeoLocations.set(
            current.map((item, i) =>
                i === additionalIndex ? { ...item, added: !item.added } : item,
            ),
        );
        mapGeoJSON.set(null);
        polyGeoJSON.set(null);
        questions.set([...questions.get()]);
        posthog?.capture("zone_toggled", { added: newAdded });
    }

    function handleRemove(rowIndex: number, isBase: boolean) {
        if (isBase) {
            const current = additionalMapGeoLocations.get();
            const firstAdded = current.find((x) => x.added === true);
            if (!firstAdded) {
                Alert.alert(
                    "Cannot remove",
                    "Please add another location in addition mode first.",
                );
                return;
            }
            additionalMapGeoLocations.set(
                current.filter((x) => x !== firstAdded),
            );
            mapGeoLocation.set(firstAdded.location);
        } else {
            const additionalIndex = rowIndex - 1;
            const current = additionalMapGeoLocations.get();
            additionalMapGeoLocations.set(
                current.filter((_, i) => i !== additionalIndex),
            );
        }
        mapGeoJSON.set(null);
        polyGeoJSON.set(null);
        questions.set([...questions.get()]);
        posthog?.capture("zone_removed", { was_base: isBase });
    }

    function handleSelectResult(feature: PhotonFeature) {
        additionalMapGeoLocations.set([
            ...additionalMapGeoLocations.get(),
            { added: true, location: swapCoords(feature), base: false },
        ]);
        mapGeoJSON.set(null);
        polyGeoJSON.set(null);
        questions.set([...questions.get()]);
        setQuery("");
        posthog?.capture("zone_added", {
            zone_name: feature.properties.name,
            osm_id: feature.properties.osm_id,
        });
    }

    function handleDrawPolygon() {
        onStartDrawPolygon();
        onClose();
    }

    function handleClearZone() {
        Alert.alert(
            "Reset everything?",
            "This will clear any added zone boundaries and questions.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Reset",
                    style: "destructive",
                    onPress: () => {
                        const hadAdditional =
                            additionalMapGeoLocations.get().length > 0;
                        polyGeoJSON.set(null);
                        questions.set([]);
                        additionalMapGeoLocations.set([]);
                        if (hadAdditional) mapGeoJSON.set(null);
                        posthog?.capture("zone_cleared");
                    },
                },
            ],
        );
    }

    // ── Hiding zone helpers ──────────────────────────────────────────────────

    function toggleTransitType(tag: string) {
        const current = displayHidingZonesOptions.get();
        if (current.includes(tag)) {
            displayHidingZonesOptions.set(current.filter((t) => t !== tag));
        } else {
            displayHidingZonesOptions.set([...current, tag]);
        }
    }

    function commitRadiusText(text: string) {
        const n = parseFloat(text);
        if (!isNaN(n) && n > 0) {
            hidingRadius.set(n);
        } else {
            // Revert to current atom value
            setHidingRadiusText(String($hidingRadius));
        }
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

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={["100%"]}
            enableDynamicSizing={false}
            topInset={insets.top}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            onChange={handleSheetChange}
        >
            <BottomSheetScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 32 }}
            >
                {/* Header */}
                <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                    <Text className="flex-1 text-2xl font-semibold text-gray-800">
                        Map Configuration
                    </Text>
                    <Pressable onPress={onClose} hitSlop={8}>
                        <Ionicons name="close" size={24} color="#555" />
                    </Pressable>
                </View>

                {/* Selected locations */}
                {selectedLocations.map((item, rowIndex) => (
                    <View
                        key={`${item.location.properties.osm_id}-${rowIndex}`}
                        className={`flex-row items-center px-4 py-2${!item.base && !item.added ? " bg-[#e3e4e6]" : ""}`}
                    >
                        <Text
                            className="flex-1 text-lg mr-2"
                            style={{ color: item.added ? "#1f2937" : "#888888" }}
                            numberOfLines={1}
                        >
                            {determineName(item.location)}
                        </Text>
                        <View className="flex-row items-center gap-2">
                            {!item.base && (
                                <TouchableOpacity
                                    hitSlop={8}
                                    activeOpacity={0.6}
                                    onPress={() => handleToggleAdded(rowIndex)}
                                >
                                    <Ionicons
                                        name={
                                            item.added
                                                ? "ban-outline"
                                                : "add-outline"
                                        }
                                        size={24}
                                        color={colors.PRIMARY}
                                    />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                hitSlop={8}
                                activeOpacity={0.6}
                                onPress={() =>
                                    handleRemove(rowIndex, item.base)
                                }
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={24}
                                    color="#6b7280"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}

                {/* Drawn polygon rows */}
                {$polyGeoJSON?.features.map((f, i) => {
                    const isAdded = f.properties?.added !== false;
                    return (
                        <View
                            key={`poly-${i}`}
                            className={`flex-row items-center px-4 py-2${!isAdded ? " bg-[#e3e4e6]" : ""}`}
                        >
                            <Ionicons name="shapes-outline" size={20} color={colors.PRIMARY} />
                            <Text
                                className="flex-1 text-lg ml-2"
                                style={{ color: isAdded ? "#1f2937" : "#888888" }}
                            >
                                Custom polygon {i + 1}
                            </Text>
                            <View className="flex-row items-center gap-2">
                                <TouchableOpacity
                                    hitSlop={8}
                                    activeOpacity={0.6}
                                    onPress={() => {
                                        const features = $polyGeoJSON.features.map((g, j) =>
                                            j === i
                                                ? { ...g, properties: { ...g.properties, added: !isAdded } }
                                                : g,
                                        );
                                        polyGeoJSON.set({ type: "FeatureCollection", features });
                                        mapGeoJSON.set(null);
                                    }}
                                >
                                    <Ionicons
                                        name={isAdded ? "ban-outline" : "add-outline"}
                                        size={24}
                                        color={colors.PRIMARY}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    hitSlop={8}
                                    activeOpacity={0.6}
                                    onPress={() => {
                                        const remaining = $polyGeoJSON.features.filter((_, j) => j !== i);
                                        polyGeoJSON.set(remaining.length === 0 ? null : { type: "FeatureCollection", features: remaining });
                                        mapGeoJSON.set(null);
                                    }}
                                >
                                    <Ionicons name="trash-outline" size={24} color="#6b7280" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}

                {/* Separator */}
                <View className="h-px bg-gray-200 mx-4 my-2" />

                {/* Search bar */}
                <View className="mx-4 mb-3 flex flex-row items-center bg-gray-100 rounded-xl px-3 h-11">
                    <Ionicons name="search" size={18} color="#888" />
                    <TextInput
                        style={searchInputStyle}
                        placeholder="Search for a location…"
                        placeholderTextColor="#aaa"
                        value={query}
                        onChangeText={setQuery}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="done"
                    />
                    {loading && (
                        <ActivityIndicator
                            size="small"
                            color={colors.PRIMARY}
                        />
                    )}
                    {!loading && query.length > 0 && (
                        <Pressable onPress={() => setQuery("")} hitSlop={8}>
                            <Ionicons
                                name="close-circle"
                                size={18}
                                color="#aaa"
                            />
                        </Pressable>
                    )}
                </View>

                {/* Search results */}
                {results.length > 0
                    ? results.map((item) => {
                          const label = determineName(swapCoords(item));
                          const seen = (_placeSeen[label] =
                              (_placeSeen[label] || 0) + 1);
                          const displayLabel =
                              _placeLabelCounts[label] > 1
                                  ? `${label} (${seen})`
                                  : label;
                          return (
                              <Pressable
                                  key={`${item.properties.osm_id}${item.properties.name}`}
                                  onPress={() => handleSelectResult(item)}
                                  style={resultRowStyle}
                              >
                                  <Ionicons
                                      name="location-outline"
                                      size={20}
                                      color={colors.PRIMARY}
                                  />
                                  <View className="ml-3 flex-1">
                                      <Text
                                          className="text-base text-gray-800"
                                          numberOfLines={1}
                                      >
                                          {displayLabel}
                                      </Text>
                                      {item.properties.state ||
                                      item.properties.country ? (
                                          <Text
                                              className="text-sm text-gray-400 mt-0.5"
                                              numberOfLines={1}
                                          >
                                              {[
                                                  item.properties.state,
                                                  item.properties.country,
                                              ]
                                                  .filter(Boolean)
                                                  .join(", ")}
                                          </Text>
                                      ) : null}
                                  </View>
                                  <Ionicons
                                      name="chevron-forward"
                                      size={16}
                                      color="#ccc"
                                  />
                              </Pressable>
                          );
                      })
                    : query.length > 0 && !loading
                      ? (
                          <Text className="text-center text-gray-400 my-8">
                              No results found
                          </Text>
                        )
                      : null}

                {/* Footer buttons */}
                <View className="px-4 pt-2 pb-4 border-t border-gray-100 mt-2 gap-2">
                    <Pressable
                        onPress={handleDrawPolygon}
                        style={footerButtonStyle}
                    >
                        <Ionicons
                            name="pencil-outline"
                            size={18}
                            color={colors.PRIMARY}
                        />
                        <Text className="ml-2 text-base font-medium" style={{ color: colors.PRIMARY }}>
                            Draw custom polygon
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={handleClearZone}
                        style={footerButtonStyle}
                    >
                        <Ionicons
                            name="trash-outline"
                            size={18}
                            color="#ef4444"
                        />
                        <Text className="ml-2 text-base font-medium text-red-500">
                            Clear zone
                        </Text>
                    </Pressable>
                </View>

                {/* ── Hiding Zones ────────────────────────────────────────── */}
                <View className="h-px bg-gray-200 mx-4 mb-4" />

                <View className="px-4 pb-4">
                    <Text className="text-lg font-semibold text-gray-800 mb-3">
                        Hiding Zones
                    </Text>

                    {/* Toggle */}
                    <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-base text-gray-700">
                            Show hiding zones
                        </Text>
                        <Switch
                            value={$displayHidingZones}
                            onValueChange={(v) => displayHidingZones.set(v)}
                            trackColor={{
                                false: "#d1d5db",
                                true: colors.RADIUS,
                            }}
                        />
                    </View>

                    {$displayHidingZones && (
                        <>
                            {/* Show circles toggle */}
                            <View className="flex-row items-center justify-between mb-3">
                                <Text className="text-base text-gray-700">
                                    Show circles
                                </Text>
                                <Switch
                                    value={$showHidingZoneCircles}
                                    onValueChange={(v) => showHidingZoneCircles.set(v)}
                                    trackColor={{
                                        false: "#d1d5db",
                                        true: colors.RADIUS,
                                    }}
                                />
                            </View>

                            {/* Transit type multi-select chips */}
                            <View className="flex-row flex-wrap gap-2 mb-4">
                                {TRANSIT_OPTIONS.map((opt) => {
                                    const selected =
                                        $displayHidingZonesOptions.includes(
                                            opt.tag,
                                        );
                                    return (
                                        <Pressable
                                            key={opt.tag}
                                            onPress={() =>
                                                toggleTransitType(opt.tag)
                                            }
                                            style={[
                                                chipStyle,
                                                selected
                                                    ? chipSelectedStyle
                                                    : chipUnselectedStyle,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    chipTextStyle,
                                                    selected
                                                        ? chipTextSelectedStyle
                                                        : chipTextUnselectedStyle,
                                                ]}
                                            >
                                                {opt.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* Radius row */}
                            <View className="flex-row items-center gap-3 mb-3">
                                <Text className="text-base text-gray-700 flex-1">
                                    Radius
                                </Text>
                                <TextInput
                                    style={radiusInputStyle}
                                    keyboardType="decimal-pad"
                                    value={hidingRadiusText}
                                    onChangeText={setHidingRadiusText}
                                    onBlur={() =>
                                        commitRadiusText(hidingRadiusText)
                                    }
                                    onEndEditing={() =>
                                        commitRadiusText(hidingRadiusText)
                                    }
                                    returnKeyType="done"
                                />
                                <View style={unitToggleContainerStyle}>
                                    <Pressable
                                        onPress={() =>
                                            hidingRadiusUnits.set("miles")
                                        }
                                        style={[
                                            unitToggleButtonStyle,
                                            $hidingRadiusUnits === "miles"
                                                ? unitToggleActiveStyle
                                                : unitToggleInactiveStyle,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                unitToggleTextStyle,
                                                $hidingRadiusUnits === "miles"
                                                    ? unitToggleTextActiveStyle
                                                    : unitToggleTextInactiveStyle,
                                            ]}
                                        >
                                            mi
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() =>
                                            hidingRadiusUnits.set("kilometers")
                                        }
                                        style={[
                                            unitToggleButtonStyle,
                                            $hidingRadiusUnits === "kilometers"
                                                ? unitToggleActiveStyle
                                                : unitToggleInactiveStyle,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                unitToggleTextStyle,
                                                $hidingRadiusUnits ===
                                                "kilometers"
                                                    ? unitToggleTextActiveStyle
                                                    : unitToggleTextInactiveStyle,
                                            ]}
                                        >
                                            km
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Shade non-hiding areas */}
                            <View className="flex-row items-center justify-between">
                                <Text className="text-base text-gray-700">
                                    Shade non-hiding areas
                                </Text>
                                <Switch
                                    value={$mergeDuplicates}
                                    onValueChange={(v) =>
                                        mergeDuplicates.set(v)
                                    }
                                    trackColor={{
                                        false: "#d1d5db",
                                        true: colors.RADIUS,
                                    }}
                                />
                            </View>
                        </>
                    )}
                </View>
            </BottomSheetScrollView>
        </BottomSheet>
    );
}

// ── Styles (StyleSheet-incompatible props use inline objects) ──────────────

const searchInputStyle = {
    flex: 1,
    marginLeft: 8,
    color: "#1f2937",
    alignSelf: "stretch" as const,
    fontSize: 16,
};

const resultRowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
};

const footerButtonStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    height: 48,
};

const chipStyle = {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
};
const chipSelectedStyle = {
    backgroundColor: colors.RADIUS,
    borderColor: colors.RADIUS,
};
const chipUnselectedStyle = {
    backgroundColor: "white",
    borderColor: "#d1d5db",
};
const chipTextStyle = { fontSize: 15 };
const chipTextSelectedStyle = { color: "white" };
const chipTextUnselectedStyle = { color: "#374151" };

const radiusInputStyle = {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 72,
    textAlign: "center" as const,
    fontSize: 16,
    color: "#1f2937",
};

const unitToggleContainerStyle = {
    flexDirection: "row" as const,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    overflow: "hidden" as const,
};
const unitToggleButtonStyle = {
    paddingHorizontal: 12,
    paddingVertical: 8,
};
const unitToggleActiveStyle = { backgroundColor: "#1f2937" };
const unitToggleInactiveStyle = { backgroundColor: "white" };
const unitToggleTextStyle = { fontSize: 15 };
const unitToggleTextActiveStyle = { color: "white" };
const unitToggleTextInactiveStyle = { color: "#374151" };
