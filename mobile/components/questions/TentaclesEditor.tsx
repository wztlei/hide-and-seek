import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";

import type { Feature, Point } from "geojson";
import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { questionModified, questions } from "../../lib/context";
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
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
}

export function TentaclesEditor({ data, editingKey, onPickLocationOnMap }: Props) {
    const $questions = useStore(questions) as Questions;

    const [radiusText, setRadiusText] = useState(String(data.radius));
    const [pois, setPois] = useState<Feature<Point>[]>([]);
    const [loading, setLoading] = useState(false);
    const [reloadCount, setReloadCount] = useState(0);
    // Set to true before incrementing reloadCount so the effect can read it.
    const forceRef = useRef(false);

    // Recompute whenever question data changes (questions atom gets new array ref on every questionModified())
    const fetchKey = useMemo(() => {
        const q = $questions.find((x) => x.key === editingKey);
        if (q?.id !== "tentacles") return null;
        if (!q.data.within) return null;
        if (q.data.locationType === "custom") return null;
        return `${q.data.lat},${q.data.lng},${q.data.radius},${q.data.unit},${q.data.locationType}`;
    }, [$questions, editingKey]);

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
            ? (data.location as any).properties?.name ?? null
            : null;

    const poiOptions = [...pois]
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
                <View style={{ flexDirection: "row", alignItems: "stretch", gap: 12 }}>
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
                        {(["miles", "kilometers", "meters"] as const).map((u) => {
                            const selected = data.unit === u;
                            const label =
                                u === "miles" ? "mi" : u === "kilometers" ? "km" : "m";
                            return (
                                <Pressable
                                    key={u}
                                    onPress={() => {
                                        data.unit = u;
                                        questionModified();
                                    }}
                                    style={[
                                        editorStyles.segmentItem,
                                        selected && { backgroundColor: colors.TENTACLES },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            editorStyles.segmentText,
                                            selected && editorStyles.segmentTextSelected,
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
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
                                    selected && { backgroundColor: colors.TENTACLES },
                                ]}
                            >
                                <Text
                                    style={[
                                        editorStyles.segmentText,
                                        selected && editorStyles.segmentTextSelected,
                                    ]}
                                >
                                    {label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View className="gap-2">
                <Text className="text-sm font-semibold uppercase tracking-wide" style={{ color: data.within ? "#6b7280" : "#d1d5db" }}>
                    Location Type
                </Text>
                <Dropdown
                    data={LOCATION_TYPE_OPTIONS}
                    labelField="label"
                    valueField="value"
                    value={data.locationType}
                    onChange={(item) => {
                        data.locationType = item.value as any;
                        data.location = false;
                        questionModified();
                    }}
                    disable={!data.within}
                    style={[dropdownStyle.container, !data.within && { opacity: 0.45 }]}
                    selectedTextStyle={dropdownStyle.selectedText}
                    itemTextStyle={dropdownStyle.itemText}
                    activeColor="#dcfce7"
                    placeholder="Select type…"
                />
            </View>

            <View className="gap-2">
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text className="text-sm font-semibold uppercase tracking-wide" style={{ color: data.within ? "#6b7280" : "#d1d5db" }}>
                        Location
                    </Text>
                    <Pressable onPress={handleReload} hitSlop={8} style={{ padding: 2 }} disabled={!data.within}>
                        <Ionicons name="refresh-outline" size={18} color={data.within ? "#6b7280" : "#d1d5db"} />
                    </Pressable>
                </View>
                {loading ? (
                    <View className="flex-row items-center gap-3 px-1 py-3">
                        <ActivityIndicator size="small" color={colors.TENTACLES} />
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
                            pois.length === 0
                                ? "No locations found nearby"
                                : "Select a location…"
                        }
                        disable={!data.within || pois.length === 0}
                        style={[
                            dropdownStyle.container,
                            (!data.within || pois.length === 0) && { opacity: 0.45 },
                        ]}
                        selectedTextStyle={dropdownStyle.selectedText}
                        itemTextStyle={dropdownStyle.itemText}
                        inputSearchStyle={dropdownStyle.searchInput}
                        activeColor="#dcfce7"
                    />
                )}
            </View>
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
