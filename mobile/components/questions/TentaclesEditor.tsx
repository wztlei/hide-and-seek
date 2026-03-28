import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";
import { Dropdown } from "react-native-element-dropdown";

import * as turf from "@turf/turf";

import type { Feature, Point } from "geojson";
import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { customPOIs, questionModified, questions } from "../../lib/context";
import { draftQuestion } from "../../lib/draftQuestion";
import { fetchTentacleLocations } from "../../lib/tentacleApi";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type TentaclesData = Extract<Questions[number], { id: "tentacles" }>["data"];

const LOCATION_TYPE_LABELS: Record<string, string> = {
    theme_park: "Theme Parks",
    zoo: "Zoos",
    aquarium: "Aquariums",
    museum: "Museums",
    hospital: "Hospitals",
    cinema: "Movie Theaters",
    library: "Libraries",
};

const LOCATION_TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS).map(
    ([value, label]) => ({ label, value }),
);

interface Props {
    data: TentaclesData;
    editingKey: number;
    isNew?: boolean;
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
    onOpenCustomPOIs?: (type: string) => void;
}

export function TentaclesEditor({
    data,
    editingKey,
    isNew,
    onPickLocationOnMap,
    onOpenCustomPOIs,
}: Props) {
    const $questions = useStore(questions) as Questions;
    const $draftQuestion = useStore(draftQuestion);
    const $customPOIs = useStore(customPOIs);

    const [radiusText, setRadiusText] = useState(String(data.radius));
    const [pois, setPois] = useState<Feature<Point>[]>([]);
    const [loading, setLoading] = useState(false);
    const [reloadCount, setReloadCount] = useState(0);
    // Tracks whether the user has explicitly chosen a location type.
    // New questions start unselected; existing questions start selected.
    const [hasSelectedType, setHasSelectedType] = useState(!isNew);
    // Set to true before incrementing reloadCount so the effect can read it.
    const forceRef = useRef(false);

    // Recompute whenever question data changes. Checks both the store (existing
    // questions) and the draft atom (new questions being added).
    const fetchKey = useMemo(() => {
        const stored = $questions.find((x) => x.key === editingKey);
        const q =
            (stored?.id === "tentacles" ? stored : null) ??
            ($draftQuestion?.key === editingKey &&
            $draftQuestion.id === "tentacles"
                ? $draftQuestion
                : null);
        if (!q) return null;
        if (!q.data.within) return null;
        if (!hasSelectedType) return null;
        if (q.data.locationType === "custom") return null;
        return `${q.data.lat},${q.data.lng},${q.data.radius},${q.data.unit},${q.data.locationType}`;
    }, [$questions, $draftQuestion, editingKey, hasSelectedType]);

    useEffect(() => {
        if (!fetchKey) return;
        let cancelled = false;
        const force = forceRef.current;
        forceRef.current = false;
        setLoading(true);
        setPois([]);
        fetchTentacleLocations(data as any, { force })
            .then((fc) => {
                if (!cancelled) {
                    setPois(fc.features as Feature<Point>[]);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [fetchKey, reloadCount]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleReload = () => {
        forceRef.current = true;
        setReloadCount((c) => c + 1);
    };

    const selectedPoiName =
        data.location !== false
            ? ((data.location as any).properties?.name ?? null)
            : null;

    // Merge custom POIs for this type into the selectable list.
    const customForType: Feature<Point>[] =
        hasSelectedType ? ($customPOIs[data.locationType] ?? []) : [];
    const allPois = [
        ...pois,
        ...customForType.filter(
            (cp) =>
                !pois.some(
                    (p) =>
                        (p as any).properties?.name ===
                        (cp as any).properties?.name,
                ),
        ),
    ];

    const outsideCount = allPois.filter((poi) => {
        const d = turf.distance(
            [data.lng, data.lat],
            poi.geometry.coordinates as [number, number],
            { units: data.unit },
        );
        return d > data.radius;
    }).length;

    const poiOptions = [...allPois]
        .sort((a, b) => {
            const aSelected = (a as any).properties.name === selectedPoiName;
            const bSelected = (b as any).properties.name === selectedPoiName;
            if (aSelected) return -1;
            if (bSelected) return 1;
            return 0;
        })
        .map((poi) => ({
            label: (poi as any).properties.name as string,
            value: (poi as any).properties.name as string,
            poi,
        }));

    return (
        <View className="gap-4 px-4">
            {/* Anchor Point */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Anchor Point
                </Text>
                <LocationButtons
                    color={colors.TENTACLES}
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

            {/* Radius */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Radius
                </Text>
                <View className="flex-row items-stretch gap-3">
                    <TextInput
                        value={radiusText}
                        onChangeText={(text) => {
                            setRadiusText(text);
                            const n = parseFloat(text);
                            if (!isNaN(n) && n >= 0) {
                                data.radius = n;
                                questionModified();
                            }
                        }}
                        keyboardType="numeric"
                        returnKeyType="done"
                        style={editorStyles.radiusInput}
                        selectTextOnFocus
                    />
                    <View style={[editorStyles.segmentRow, { height: 44 }]}>
                        {(["miles", "kilometers", "meters"] as const).map(
                            (u) => {
                                const selected = data.unit === u;
                                const label =
                                    u === "miles"
                                        ? "mi"
                                        : u === "kilometers"
                                          ? "km"
                                          : "m";
                                return (
                                    <Pressable
                                        key={u}
                                        onPress={() => {
                                            data.unit = u;
                                            questionModified();
                                        }}
                                        style={[
                                            editorStyles.segmentItem,
                                            selected && {
                                                backgroundColor:
                                                    colors.TENTACLES,
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
                            },
                        )}
                    </View>
                </View>
            </View>

            {/* Inside / Outside + Location Type + Location */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Result
                </Text>
                <View style={editorStyles.segmentRow}>
                    {(["Outside", "Inside"] as const).map((label) => {
                        const isWithin = label === "Inside";
                        const selected = data.within === isWithin;
                        return (
                            <Pressable
                                key={label}
                                onPress={() => {
                                    data.within = isWithin;
                                    if (!isWithin) data.location = false;
                                    questionModified();
                                }}
                                style={[
                                    editorStyles.segmentItem,
                                    editorStyles.segmentItemWide,
                                    selected && {
                                        backgroundColor: colors.TENTACLES,
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
            {data.within && (
                <>
                    <View className="gap-2">
                        <Text
                            className="text-sm font-semibold uppercase tracking-wide"
                            style={{
                                color: data.within ? "#6b7280" : "#d1d5db",
                            }}
                        >
                            Location Type
                        </Text>
                        <Dropdown
                            data={LOCATION_TYPE_OPTIONS}
                            labelField="label"
                            valueField="value"
                            value={hasSelectedType ? data.locationType : null}
                            onChange={(item) => {
                                data.locationType = item.value as any;
                                data.location = false;
                                setHasSelectedType(true);
                                questionModified();
                            }}
                            disable={!data.within}
                            style={[
                                dropdownStyle.container,
                                !data.within && { opacity: 0.45 },
                            ]}
                            selectedTextStyle={dropdownStyle.selectedText}
                            itemTextStyle={dropdownStyle.itemText}
                            activeColor="#dcfce7"
                            placeholder="Select type…"
                        />
                    </View>

                    <View className="gap-2">
                        <View className="flex-row items-center justify-between">
                            <Text
                                className="text-sm font-semibold uppercase tracking-wide"
                                style={{
                                    color: data.within ? "#6b7280" : "#d1d5db",
                                }}
                            >
                                Location
                            </Text>
                            <Pressable
                                onPress={handleReload}
                                hitSlop={8}
                                className="p-0.5"
                                disabled={!data.within}
                            >
                                <Ionicons
                                    name="refresh-outline"
                                    size={18}
                                    color={data.within ? "#6b7280" : "#d1d5db"}
                                />
                            </Pressable>
                        </View>
                        {loading ? (
                            <View className="flex-row items-center gap-3 px-1 py-3">
                                <ActivityIndicator
                                    size="small"
                                    color={colors.TENTACLES}
                                />
                                <Text className="text-base text-gray-400">
                                    Loading{" "}
                                    {LOCATION_TYPE_LABELS[data.locationType] ??
                                        data.locationType}
                                    …
                                </Text>
                            </View>
                        ) : (
                            <Dropdown
                                data={poiOptions}
                                labelField="label"
                                valueField="value"
                                value={selectedPoiName}
                                onChange={(item) => {
                                    data.location = item.poi as any;
                                    questionModified();
                                }}
                                search
                                searchPlaceholder="Search…"
                                placeholder={
                                    allPois.length === 0
                                        ? "No locations found nearby"
                                        : "Select a location…"
                                }
                                disable={!data.within || allPois.length === 0}
                                style={[
                                    dropdownStyle.container,
                                    (!data.within || allPois.length === 0) && {
                                        opacity: 0.45,
                                    },
                                ]}
                                selectedTextStyle={dropdownStyle.selectedText}
                                itemTextStyle={dropdownStyle.itemText}
                                inputSearchStyle={dropdownStyle.searchInput}
                                activeColor="#dcfce7"
                            />
                        )}
                    </View>

                    {/* Custom POIs — only when a type is selected */}
                    {hasSelectedType && onOpenCustomPOIs && (
                        <View className="gap-2">
                            <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                Custom POIs
                            </Text>
                            <Pressable
                                className="flex-row items-center gap-2 px-3 py-2.5 rounded-[10px] border border-gray-200 bg-white"
                                onPress={() =>
                                    onOpenCustomPOIs(data.locationType)
                                }
                            >
                                <View className="flex-1 gap-0.5">
                                    <Text className="text-[15px] text-[#374151]">
                                        {(() => {
                                            const customCount =
                                                customForType.length;
                                            const fetchedCount = pois.length;
                                            const parts = [
                                                `${fetchedCount} fetched`,
                                            ];
                                            if (customCount > 0)
                                                parts.push(
                                                    `${customCount} custom`,
                                                );
                                            if (outsideCount > 0)
                                                parts.push(
                                                    `${outsideCount} outside radius`,
                                                );
                                            return parts.join(" · ");
                                        })()}
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={18}
                                    color="#9ca3af"
                                />
                            </Pressable>
                        </View>
                    )}
                </>
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
    itemText: {
        fontSize: 15,
        color: "#374151",
    },
    searchInput: {
        fontSize: 14,
        color: "#374151",
        borderColor: "#e5e7eb",
    },
};
