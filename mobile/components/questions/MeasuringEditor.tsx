import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";

import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { mapGeoJSON, questionModified } from "../../lib/context";
import {
    fetchAirports,
    fetchCities,
    fetchMeasuringPOIs,
} from "../../lib/measuringApi";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";
import { parseCoordinatesFromText } from "./utils";

type MeasuringData = Extract<Questions[number], { id: "measuring" }>["data"];

type DropdownItem =
    | { isHeader: true; label: string; value: string }
    | { isHeader?: false; label: string; value: string };

const DROPDOWN_DATA: DropdownItem[] = [
    { isHeader: true, label: "Standard", value: "__header_standard" },
    { label: "Coastline", value: "coastline" },
    { label: "City", value: "city" },
    { label: "High-speed rail", value: "highspeed-measure-shinkansen" },
    { isHeader: true, label: "Points of Interest", value: "__header_poi" },
    { label: "Airport", value: "airport" },
    { label: "Aquarium", value: "aquarium" },
    { label: "Zoo", value: "zoo" },
    { label: "Theme park", value: "theme_park" },
    { label: "Mountain", value: "peak" },
    { label: "Museum", value: "museum" },
    { label: "Hospital", value: "hospital" },
    { label: "Cinema", value: "cinema" },
    { label: "Library", value: "library" },
    { label: "Golf course", value: "golf_course" },
    { label: "Consulate", value: "consulate" },
    { label: "Park", value: "park" },
];

const SELECTABLE_DATA = DROPDOWN_DATA.filter((d) => !d.isHeader);

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

const MEASURING_HOME_GAME_TYPES = [
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
] as const;

const MEASURING_POI_TYPES = new Set([
    ...MEASURING_HOME_GAME_TYPES,
    "aquarium-full",
    "zoo-full",
    "theme_park-full",
    "peak-full",
    "museum-full",
    "hospital-full",
    "cinema-full",
    "library-full",
    "golf_course-full",
    "consulate-full",
    "park-full",
]);

// Types that support a configurable search area + search center (all Overpass-backed types).
const MEASURING_SEARCH_TYPES = new Set([
    "airport",
    "city",
    ...MEASURING_POI_TYPES,
]);

const SEARCH_RADIUS_OPTIONS = [
    { km: 100, label: "100 km" },
    { km: 250, label: "250 km" },
    { km: 500, label: "500 km" },
    { km: null, label: "Full" },
] as const;

interface Props {
    data: MeasuringData;
    editingKey: number;
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
}

export function MeasuringEditor({
    data,
    editingKey,
    onPickLocationOnMap,
}: Props) {
    const [poiCount, setPoiCount] = useState<number | null>(null);
    const [nearestPOIName, setNearestPOIName] = useState<string | null>(null);
    const [nearestPOIDistanceKm, setNearestPOIDistanceKm] = useState<
        number | null
    >(null);
    const [loadingPOIs, setLoadingPOIs] = useState(false);
    const $mapGeoJSON = useStore(mapGeoJSON);
    const isPOIType = MEASURING_POI_TYPES.has(data.type);
    const isSearchType = MEASURING_SEARCH_TYPES.has(data.type);
    // poiSearchLat/Lng are undefined when the user has not explicitly set an
    // custom search region — in that case the seeker location is used.
    const hasCustomSearch = (data as any).poiSearchLat != null;
    const customSearchLat = (data as any).poiSearchLat as number | undefined;
    const customSearchLng = (data as any).poiSearchLng as number | undefined;
    // Effective search center (falls back to seeker for bbox computation).
    const searchLat = customSearchLat ?? data.lat;
    const searchLng = customSearchLng ?? data.lng;

    useEffect(() => {
        if (!isSearchType || !$mapGeoJSON) {
            setPoiCount(null);
            setNearestPOIName(null);
            setNearestPOIDistanceKm(null);
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
                          turf.circle([searchLng, searchLat], radiusKm, {
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
        const fetchPromise =
            data.type === "airport"
                ? fetchAirports(bbox)
                : data.type === "city"
                  ? fetchCities(bbox)
                  : fetchMeasuringPOIs(data.type, bbox);
        fetchPromise
            .then((fc) => {
                if (cancelled) return;
                setPoiCount(fc.features.length);
                if (fc.features.length > 0) {
                    const seekerPt = turf.point([data.lng, data.lat]);
                    const nearest = turf.nearestPoint(seekerPt, fc as any);
                    setNearestPOIName(
                        (nearest as any).properties?.name ?? null,
                    );
                    setNearestPOIDistanceKm(
                        turf.distance(seekerPt, nearest, {
                            units: "kilometers",
                        }),
                    );
                } else {
                    setNearestPOIName(null);
                    setNearestPOIDistanceKm(null);
                }
                setLoadingPOIs(false);
            })
            .catch(() => {
                if (!cancelled) setLoadingPOIs(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        data.type,
        data.lat,
        data.lng,
        searchLat,
        searchLng,
        $mapGeoJSON,
        isSearchType,
        (data as any).poiSearchRadius,
    ]);

    return (
        <View className="gap-4 px-4">
            {/* Feature Type dropdown */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Feature Type
                </Text>
                <Dropdown
                    data={DROPDOWN_DATA}
                    labelField="label"
                    valueField="value"
                    value={
                        SELECTABLE_DATA.find((d) => d.value === data.type)
                            ?.value ?? null
                    }
                    onChange={(item) => {
                        if (item.isHeader) return;
                        (data as any).type = item.value;
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
                        const selected = item.value === data.type;
                        return (
                            <View
                                style={[
                                    dropdownItemStyle,
                                    selected && { backgroundColor: "#ecfeff" },
                                ]}
                            >
                                <Text
                                    style={[
                                        dropdownItemTextStyle,
                                        selected && {
                                            color: "#164e63",
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
                    activeColor="#ecfeff"
                    placeholder="Select type…"
                    autoScroll={false}
                    flatListProps={{
                        initialScrollIndex: dropdownInitialIndex(
                            data.type ?? "",
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
            {/* Search Area — for all Overpass-backed types */}
            {isSearchType && (
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
                                            backgroundColor: colors.MEASURING,
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

            {/* Closer / Farther toggle */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Answer
                </Text>
                <View style={editorStyles.segmentRow}>
                    {([true, false] as const).map((val) => {
                        const selected = data.hiderCloser === val;
                        return (
                            <Pressable
                                key={String(val)}
                                onPress={() => {
                                    data.hiderCloser = val;
                                    questionModified();
                                }}
                                style={[
                                    editorStyles.segmentItem,
                                    editorStyles.segmentItemWide,
                                    selected && {
                                        backgroundColor: colors.MEASURING,
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
                                    {val ? "Closer" : "Farther"}
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
                    color={colors.MEASURING}
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
            {/* Custom Search Region — for all Overpass-backed types */}
            {isSearchType && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Custom Search Region
                    </Text>
                    {hasCustomSearch ? (
                        <>
                            <LocationButtons
                                color={colors.MEASURING}
                                lat={customSearchLat!}
                                lng={customSearchLng!}
                                editingKey={editingKey}
                                field="B"
                                onPickLocationOnMap={onPickLocationOnMap}
                                onUpdate={(lat, lng) => {
                                    (data as any).poiSearchLat = lat;
                                    (data as any).poiSearchLng = lng;
                                    questionModified();
                                }}
                            />
                            <Pressable
                                onPress={() => {
                                    (data as any).poiSearchLat = undefined;
                                    (data as any).poiSearchLng = undefined;
                                    questionModified();
                                }}
                                className="active:opacity-70"
                            >
                                <Text className="text-sm text-center text-red-400">
                                    Reset to Seeker Location
                                </Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <Text className="text-sm text-gray-400 px-1">
                                Search POIs around a second point.
                            </Text>
                            <View className="flex-row gap-2">
                                <Pressable
                                    onPress={() =>
                                        onPickLocationOnMap?.(editingKey, "B")
                                    }
                                    style={editorStyles.locationBtn}
                                    className="active:opacity-70"
                                >
                                    <Ionicons
                                        name="map-outline"
                                        size={20}
                                        color={colors.MEASURING}
                                    />
                                    <Text className="text-xs mt-1 text-gray-500">
                                        Select on Map
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={async () => {
                                        const { status } =
                                            await Location.requestForegroundPermissionsAsync();
                                        if (status !== "granted") return;
                                        const pos =
                                            await Location.getCurrentPositionAsync(
                                                {
                                                    accuracy:
                                                        Location.Accuracy
                                                            .Balanced,
                                                },
                                            );
                                        (data as any).poiSearchLat =
                                            pos.coords.latitude;
                                        (data as any).poiSearchLng =
                                            pos.coords.longitude;
                                        questionModified();
                                    }}
                                    style={editorStyles.locationBtn}
                                    className="active:opacity-70"
                                >
                                    <Ionicons
                                        name="locate-outline"
                                        size={20}
                                        color={colors.MEASURING}
                                    />
                                    <Text className="text-xs mt-1 text-gray-500">
                                        Set to Current
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={async () => {
                                        const text =
                                            await Clipboard.getStringAsync();
                                        const parsed =
                                            parseCoordinatesFromText(text);
                                        if (
                                            parsed.lat !== null &&
                                            parsed.lng !== null
                                        ) {
                                            (data as any).poiSearchLat =
                                                parsed.lat;
                                            (data as any).poiSearchLng =
                                                parsed.lng;
                                            questionModified();
                                        }
                                    }}
                                    style={editorStyles.locationBtn}
                                    className="active:opacity-70"
                                >
                                    <Ionicons
                                        name="clipboard-outline"
                                        size={20}
                                        color={colors.MEASURING}
                                    />
                                    <Text className="text-xs mt-1 text-gray-500">
                                        Paste
                                    </Text>
                                </Pressable>
                            </View>
                        </>
                    )}
                </View>
            )}

            {/* Nearby POIs — for all Overpass-backed types */}
            {isSearchType && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Nearby POIs
                    </Text>
                    {loadingPOIs ? (
                        <View className="flex-row items-center gap-3 px-1 py-2">
                            <ActivityIndicator
                                size="small"
                                color={colors.MEASURING}
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
                        <View style={poiInfoBoxStyle}>
                            <Text style={poiInfoCountStyle}>
                                {poiCount}{" "}
                                {poiCount === 1 ? "location" : "locations"}{" "}
                                found
                            </Text>
                            {nearestPOIName && (
                                <>
                                    <Text
                                        style={poiInfoNearestStyle}
                                        numberOfLines={1}
                                    >
                                        <Text className="font-semibold">
                                            Nearest
                                        </Text>
                                        : {nearestPOIName}
                                    </Text>
                                    <Text
                                        style={poiInfoNearestStyle}
                                        numberOfLines={1}
                                    >
                                        <Text className="font-semibold">
                                            Distance
                                        </Text>
                                        :{" "}
                                        {nearestPOIDistanceKm !== null &&
                                            `${nearestPOIDistanceKm < 100 ? nearestPOIDistanceKm.toFixed(1) : Math.round(nearestPOIDistanceKm)} km`}
                                    </Text>
                                </>
                            )}
                        </View>
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

const poiInfoBoxStyle = {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    gap: 2,
};

const poiInfoCountStyle = {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600" as const,
};

const poiInfoNearestStyle = {
    fontSize: 14,
    color: "#6b7280",
};
