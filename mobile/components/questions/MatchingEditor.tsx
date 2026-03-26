import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";

import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import {
    customPOIs,
    mapGeoJSON,
    mapGeoLocation,
    questionModified,
} from "../../lib/context";
import {
    fetchAvailableAdminLevels,
    fetchMatchingPOIs,
    type AdminSubLevel,
} from "../../lib/matchingApi";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type MatchingData = Extract<Questions[number], { id: "matching" }>["data"];

type DropdownItem =
    | { isHeader: true; label: string; value: string }
    | { isHeader?: false; label: string; value: string };

const DROPDOWN_DATA: DropdownItem[] = [
    { isHeader: true, label: "Basic", value: "__header_basic" },
    { label: "Administrative zone", value: "zone" },
    { label: "Airport", value: "airport" },
    // { label: "Major city", value: "major-city" }, // TODO: re-enable after testing but this is not an official question
    { isHeader: true, label: "Points of Interest", value: "__header_poi" },
    { label: "Aquarium", value: "aquarium" },
    { label: "Zoo", value: "zoo" },
    { label: "Theme park", value: "theme_park" },
    { label: "Peak", value: "peak" },
    { label: "Museum", value: "museum" },
    { label: "Hospital", value: "hospital" },
    { label: "Cinema", value: "cinema" },
    { label: "Library", value: "library" },
    { label: "Golf course", value: "golf_course" },
    { label: "Consulate", value: "consulate" },
    { label: "Park", value: "park" },
];

const SELECTABLE_DATA = DROPDOWN_DATA.filter((d) => !d.isHeader);

interface Props {
    data: MatchingData;
    editingKey: number;
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
    onOpenCustomPOIs?: (type: string) => void;
}

const POI_TYPES = new Set([
    "aquarium",
    "zoo",
    "theme_park",
    "peak",
    "museum",
    "hospital",
    "cinema",
    "library",
    "golf_course",
    "consulate",
    "park",
]);

const SEARCH_RADIUS_OPTIONS = [
    { km: 100, label: "100 km" },
    { km: 250, label: "250 km" },
    { km: 500, label: "500 km" },
    { km: null, label: "Full" },
] as const;

export function MatchingEditor({
    data,
    editingKey,
    onPickLocationOnMap,
    onOpenCustomPOIs,
}: Props) {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $mapGeoJSON = useStore(mapGeoJSON);
    const $customPOIs = useStore(customPOIs);
    const zoneOsmId = $mapGeoLocation.properties.osm_id;

    const [subLevels, setSubLevels] = useState<AdminSubLevel[]>([]);
    const [loadingLevels, setLoadingLevels] = useState(false);

    const [poiCount, setPoiCount] = useState<number | null>(null);
    const [nearestPOIName, setNearestPOIName] = useState<string | null>(null);
    const [loadingPOIs, setLoadingPOIs] = useState(false);

    const isAdminType = (data as any).type === "zone";
    const isPOIType = POI_TYPES.has((data as any).type);

    // Re-fetch whenever the seeker position or game zone changes.
    useEffect(() => {
        if (!isAdminType) return;
        let cancelled = false;
        setLoadingLevels(true);
        fetchAvailableAdminLevels(data.lat, data.lng, zoneOsmId)
            .then((levels) => {
                if (cancelled) return;
                setSubLevels(levels);
                setLoadingLevels(false);
                // If the stored osmLevel is no longer in the list, reset to the
                // first (most general) available level.
                const current = (data as any).cat?.adminLevel as
                    | number
                    | undefined;
                if (
                    levels.length > 0 &&
                    !levels.find((l) => l.osmLevel === current)
                ) {
                    (data as any).cat = { adminLevel: levels[0].osmLevel };
                    questionModified();
                }
            })
            .catch(() => {
                if (!cancelled) setLoadingLevels(false);
            });
        return () => {
            cancelled = true;
        };
    }, [data.lat, data.lng, zoneOsmId, isAdminType]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch nearby POIs for POI-based matching types.
    useEffect(() => {
        if (!isPOIType || !$mapGeoJSON) {
            setPoiCount(null);
            setNearestPOIName(null);
            return;
        }
        let cancelled = false;
        setLoadingPOIs(true);
        const zoneBbox = turf.bbox($mapGeoJSON) as [
            number,
            number,
            number,
            number,
        ];
        const sr = (data as any).poiSearchRadius as number | null | undefined;
        const radiusKm = sr === null ? null : (sr ?? 100);
        const bbox: [number, number, number, number] =
            radiusKm === null
                ? zoneBbox
                : (() => {
                      const cb = turf.bbox(
                          turf.circle([data.lng, data.lat], radiusKm, {
                              units: "kilometers",
                          }),
                      ) as [number, number, number, number];
                      return [
                          Math.max(cb[0], zoneBbox[0]),
                          Math.max(cb[1], zoneBbox[1]),
                          Math.min(cb[2], zoneBbox[2]),
                          Math.min(cb[3], zoneBbox[3]),
                      ];
                  })();
        fetchMatchingPOIs((data as any).type, bbox)
            .then((fc) => {
                if (cancelled) return;
                const custom = customPOIs.get()[(data as any).type] ?? [];
                const allFeatures = [...fc.features, ...custom];
                setPoiCount(allFeatures.length);
                if (allFeatures.length > 0) {
                    const nearest = turf.nearestPoint(
                        turf.point([data.lng, data.lat]),
                        turf.featureCollection(allFeatures) as any,
                    );
                    setNearestPOIName(
                        (nearest as any).properties?.name ?? null,
                    );
                } else {
                    setNearestPOIName(null);
                }
                setLoadingPOIs(false);
            })
            .catch(() => {
                if (!cancelled) setLoadingPOIs(false);
            });
        return () => {
            cancelled = true;
        };
    }, [
        (data as any).type,
        data.lat,
        data.lng,
        $mapGeoJSON,
        isPOIType,
        (data as any).poiSearchRadius,
        $customPOIs,
    ]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectedItem = SELECTABLE_DATA.find(
        (d) => d.value === (data as any).type,
    );
    const currentOsmLevel = (data as any).cat?.adminLevel as number | undefined;

    return (
        <View className="gap-4 px-4">
            {/* Zone Type dropdown */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Zone Type
                </Text>
                <Dropdown
                    data={DROPDOWN_DATA}
                    labelField="label"
                    valueField="value"
                    value={selectedItem?.value ?? null}
                    onChange={(item) => {
                        if (item.isHeader) return;
                        (data as any).type = item.value;
                        if (item.value === "zone") {
                            if (!(data as any).cat)
                                (data as any).cat = { adminLevel: 4 };
                        }
                        questionModified();
                    }}
                    renderItem={(item) => {
                        if (item.isHeader) {
                            return (
                                <View style={groupHeaderStyle}>
                                    <Text style={groupHeaderTextStyle}>
                                        {item.label}
                                    </Text>
                                </View>
                            );
                        }
                        const selected = item.value === (data as any).type;
                        return (
                            <View
                                style={[
                                    dropdownItemStyle,
                                    selected && { backgroundColor: "#fffbeb" },
                                ]}
                            >
                                <Text
                                    style={[
                                        dropdownItemTextStyle,
                                        selected && {
                                            color: "#92400e",
                                            fontWeight: "600",
                                        },
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </View>
                        );
                    }}
                    style={dropdownStyle.container}
                    selectedTextStyle={dropdownStyle.selectedText}
                    activeColor="#fffbeb"
                    placeholder="Select type…"
                    autoScroll={false}
                    flatListProps={{
                        initialScrollIndex: dropdownInitialIndex(
                            (data as any).type ?? "",
                        ),
                        getItemLayout: (_, index) => ({
                            length:
                                DROPDOWN_ITEM_LAYOUTS[index]?.length ??
                                DROPDOWN_ITEM_HEIGHT,
                            offset: DROPDOWN_ITEM_LAYOUTS[index]?.offset ?? 0,
                            index,
                        }),
                    }}
                />
            </View>

            {/* Search radius — only for POI types */}
            {isPOIType && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Search Area
                    </Text>
                    <View style={editorStyles.segmentRow}>
                        {SEARCH_RADIUS_OPTIONS.map(({ km, label }) => {
                            const current = (data as any).poiSearchRadius as
                                | number
                                | null
                                | undefined;
                            const selected =
                                km === null
                                    ? current === null
                                    : current === km ||
                                      (km === 100 && current === undefined);
                            return (
                                <Pressable
                                    key={String(km)}
                                    onPress={() => {
                                        (data as any).poiSearchRadius =
                                            km === 100 ? undefined : km;
                                        questionModified();
                                    }}
                                    style={[
                                        editorStyles.segmentItem,
                                        selected && {
                                            backgroundColor: colors.MATCHING,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            editorStyles.segmentText,
                                            selected &&
                                                editorStyles.segmentTextSelected,
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            )}

            {/* Admin level picker — only for zone */}
            {isAdminType && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Division Level
                    </Text>

                    {loadingLevels ? (
                        <View className="flex-row items-center gap-3 px-1 py-2">
                            <ActivityIndicator
                                size="small"
                                color={colors.MATCHING}
                            />
                            <Text className="text-base text-gray-400">
                                Detecting sub-zones…
                            </Text>
                        </View>
                    ) : subLevels.length === 0 ? (
                        <Text className="text-base text-gray-400 px-1">
                            No sub-zones found at this location
                        </Text>
                    ) : (
                        subLevels.map((level) => {
                            const selected = level.osmLevel === currentOsmLevel;
                            return (
                                <Pressable
                                    key={level.osmLevel}
                                    onPress={() => {
                                        if (!(data as any).cat)
                                            (data as any).cat = {};
                                        (data as any).cat.adminLevel =
                                            level.osmLevel;
                                        questionModified();
                                    }}
                                    style={[
                                        levelRowStyle,
                                        selected && {
                                            backgroundColor: "#fffbeb",
                                            borderColor: colors.MATCHING,
                                        },
                                    ]}
                                >
                                    <View style={levelBadgeStyle(selected)}>
                                        <Text
                                            style={levelBadgeTextStyle(
                                                selected,
                                            )}
                                        >
                                            {level.relativeLevel}
                                        </Text>
                                    </View>
                                    <Text
                                        style={[
                                            levelNameStyle,
                                            selected && {
                                                color: "#92400e",
                                                fontWeight: "600",
                                            },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {level.name}
                                    </Text>
                                </Pressable>
                            );
                        })
                    )}
                </View>
            )}

            {/* Same / Different toggle */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Answer
                </Text>
                <View style={editorStyles.segmentRow}>
                    {([true, false] as const).map((val) => {
                        const selected = data.same === val;
                        return (
                            <Pressable
                                key={String(val)}
                                onPress={() => {
                                    data.same = val;
                                    questionModified();
                                }}
                                style={[
                                    editorStyles.segmentItem,
                                    editorStyles.segmentItemWide,
                                    selected && {
                                        backgroundColor: colors.MATCHING,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        editorStyles.segmentText,
                                        selected &&
                                            editorStyles.segmentTextSelected,
                                    ]}
                                >
                                    {val ? "Same" : "Different"}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            {/* Seeker Location */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Seeker Location
                </Text>
                <LocationButtons
                    color={colors.MATCHING}
                    lat={data.lat}
                    lng={data.lng}
                    editingKey={editingKey}
                    onPickLocationOnMap={onPickLocationOnMap}
                    onUpdate={(lat, lng) => {
                        data.lat = lat;
                        data.lng = lng;
                    }}
                />
            </View>

            {/* POI info — shown for POI-based matching types */}
            {isPOIType && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Nearby POIs
                    </Text>
                    {loadingPOIs ? (
                        <View className="flex-row items-center gap-3 px-1 py-2">
                            <ActivityIndicator
                                size="small"
                                color={colors.MATCHING}
                            />
                            <Text className="text-base text-gray-400">
                                Searching nearby…
                            </Text>
                        </View>
                    ) : poiCount === null ? (
                        <Text className="text-base text-gray-400 px-1">
                            No zone loaded
                        </Text>
                    ) : poiCount === 0 ? (
                        <Text className="text-base text-gray-400 px-1">
                            No locations found in this zone
                        </Text>
                    ) : (
                        <Pressable
                            style={poiInfoBoxStyle}
                            onPress={() =>
                                onOpenCustomPOIs?.((data as any).type)
                            }
                        >
                            <View style={{ flex: 1, gap: 2 }}>
                                {nearestPOIName && (
                                    <Text
                                        style={poiInfoNearestStyle}
                                        numberOfLines={1}
                                    >
                                        Nearest: {nearestPOIName}
                                    </Text>
                                )}
                                <Text style={poiInfoCountStyle}>
                                    {(() => {
                                        const customCount = ($customPOIs[(data as any).type] ?? []).length;
                                        const fetchedCount = (poiCount ?? 0) - customCount;
                                        const parts = [`${fetchedCount} fetched`];
                                        if (customCount > 0) parts.push(`${customCount} custom`);
                                        return parts.join(" · ");
                                    })()}
                                </Text>
                            </View>
                            {onOpenCustomPOIs && (
                                <Ionicons
                                    name="chevron-forward"
                                    size={18}
                                    color="#9ca3af"
                                />
                            )}
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );
}

const dropdownStyle = {
    container: {
        height: 44,
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: "#fff",
    },
    selectedText: {
        fontSize: 15,
        color: "#1f2937",
    },
};

// Heights must match the rendered item styles below so getItemLayout is accurate.
const DROPDOWN_ITEM_HEIGHT = 44; // paddingVertical 12 * 2 + ~20 text
const DROPDOWN_HEADER_HEIGHT = 28; // paddingTop 10 + paddingBottom 4 + ~14 text

// Precompute cumulative offsets once so getItemLayout is O(1).
const DROPDOWN_ITEM_LAYOUTS = DROPDOWN_DATA.reduce<
    { length: number; offset: number }[]
>((acc, item, i) => {
    const length = item.isHeader
        ? DROPDOWN_HEADER_HEIGHT
        : DROPDOWN_ITEM_HEIGHT;
    const offset = i === 0 ? 0 : acc[i - 1].offset + acc[i - 1].length;
    acc.push({ length, offset });
    return acc;
}, []);

/** Returns the index in DROPDOWN_DATA for the given value, or undefined if not found / empty. */
function dropdownInitialIndex(selectedValue: string): number | undefined {
    if (!selectedValue) return undefined;
    const idx = DROPDOWN_DATA.findIndex(
        (d) => !d.isHeader && d.value === selectedValue,
    );
    return idx > 0 ? idx : undefined;
}

const groupHeaderStyle = {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#f9fafb",
};

const groupHeaderTextStyle = {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
};

const dropdownItemStyle = {
    paddingHorizontal: 14,
    paddingVertical: 12,
};

const dropdownItemTextStyle = {
    fontSize: 15,
    color: "#374151",
};

const levelRowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
};

function levelBadgeStyle(selected: boolean) {
    return {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: selected ? colors.MATCHING : "#f3f4f6",
        alignItems: "center" as const,
        justifyContent: "center" as const,
    };
}

function levelBadgeTextStyle(selected: boolean) {
    return {
        fontSize: 13,
        fontWeight: "700" as const,
        color: selected ? "#fff" : "#6b7280",
    };
}

const levelNameStyle = {
    flex: 1,
    fontSize: 15,
    color: "#374151",
};

const poiInfoBoxStyle = {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
};

const poiInfoNearestStyle = {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600" as const,
};

const poiInfoCountStyle = {
    fontSize: 14,
    color: "#6b7280",
};
