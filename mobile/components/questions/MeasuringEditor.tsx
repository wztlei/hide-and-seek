import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { questionModified } from "../../lib/context";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type MeasuringData = Extract<Questions[number], { id: "measuring" }>["data"];

const MEASURING_TYPE_LABELS: Record<string, string> = {
    coastline: "Coastline",
    airport: "Airport",
    city: "City",
    "highspeed-measure-shinkansen": "High-speed rail",
    aquarium: "Aquarium",
    zoo: "Zoo",
    theme_park: "Theme park",
    peak: "Mountain",
    museum: "Museum",
    hospital: "Hospital",
    cinema: "Cinema",
    library: "Library",
    golf_course: "Golf course",
    consulate: "Consulate",
    park: "Park",
    "aquarium-full": "Aquarium",
    "zoo-full": "Zoo",
    "theme_park-full": "Theme park",
    "peak-full": "Mountain",
    "museum-full": "Museum",
    "hospital-full": "Hospital",
    "cinema-full": "Cinema",
    "library-full": "Library",
    "golf_course-full": "Golf course",
    "consulate-full": "Consulate",
    "park-full": "Park",
    mcdonalds: "McDonald's",
    seven11: "7-Eleven",
    "rail-measure": "Train station",
};

const MEASURING_STANDARD_TYPES = [
    "coastline",
    "airport",
    "city",
    "highspeed-measure-shinkansen",
] as const;

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
    "aquarium-full", "zoo-full", "theme_park-full", "peak-full",
    "museum-full", "hospital-full", "cinema-full", "library-full",
    "golf_course-full", "consulate-full", "park-full",
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

function TypeRow({
    type,
    selected,
    onPress,
}: {
    type: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={[
                editorStyles.typeRow,
                {
                    borderColor: selected ? colors.MEASURING : "#e5e7eb",
                    backgroundColor: selected ? "#ecfeff" : "#fff",
                },
            ]}
        >
            <Ionicons
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                size={20}
                color={selected ? colors.MEASURING : "#9ca3af"}
            />
            <Text
                style={{
                    flex: 1,
                    fontSize: 16,
                    color: selected ? "#164e63" : "#374151",
                    fontWeight: selected ? "600" : "400",
                }}
            >
                {MEASURING_TYPE_LABELS[type] ?? type}
            </Text>
        </Pressable>
    );
}

export function MeasuringEditor({ data, editingKey, onPickLocationOnMap }: Props) {
    const isPOIType = MEASURING_POI_TYPES.has(data.type);
    return (
        <View className="gap-4 px-4">
            {/* Feature Type selector */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Feature Type
                </Text>
                <Text className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                    Standard
                </Text>
                {MEASURING_STANDARD_TYPES.map((type) => (
                    <TypeRow
                        key={type}
                        type={type}
                        selected={data.type === type}
                        onPress={() => {
                            (data as any).type = type;
                            questionModified();
                        }}
                    />
                ))}
                <Text className="text-xs text-gray-400 uppercase tracking-wide font-medium mt-1">
                    Home Game
                </Text>
                {MEASURING_HOME_GAME_TYPES.map((type) => (
                    <TypeRow
                        key={type}
                        type={type}
                        selected={data.type === type}
                        onPress={() => {
                            (data as any).type = type;
                            questionModified();
                        }}
                    />
                ))}
            </View>

            {/* Search radius — only for POI types */}
            {isPOIType && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Search Area
                    </Text>
                    <View style={editorStyles.segmentRow}>
                        {SEARCH_RADIUS_OPTIONS.map(({ km, label }) => {
                            const current = (data as any).poiSearchRadius as number | null | undefined;
                            const selected = km === null
                                ? current === null
                                : (current === km || (km === 100 && current === undefined));
                            return (
                                <Pressable
                                    key={String(km)}
                                    onPress={() => {
                                        (data as any).poiSearchRadius = km === 100 ? undefined : km;
                                        questionModified();
                                    }}
                                    style={[
                                        editorStyles.segmentItem,
                                        selected && { backgroundColor: colors.MEASURING },
                                    ]}
                                >
                                    <Text style={[
                                        editorStyles.segmentText,
                                        selected && editorStyles.segmentTextSelected,
                                    ]}>
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
        </View>
    );
}
