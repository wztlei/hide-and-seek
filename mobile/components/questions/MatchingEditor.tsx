import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { questionModified } from "../../lib/context";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type MatchingData = Extract<Questions[number], { id: "matching" }>["data"];

type MatchingBasicType = "zone" | "letter-zone" | "airport" | "major-city";
type MatchingPOIType =
    | "aquarium"
    | "zoo"
    | "theme_park"
    | "peak"
    | "museum"
    | "hospital"
    | "cinema"
    | "library"
    | "golf_course"
    | "consulate"
    | "park";

const MATCHING_TYPE_LABELS: Record<string, string> = {
    zone: "Admin zone",
    "letter-zone": "Letter zone",
    airport: "Airport",
    "major-city": "Major city",
    aquarium: "Aquarium",
    zoo: "Zoo",
    theme_park: "Theme park",
    peak: "Peak",
    museum: "Museum",
    hospital: "Hospital",
    cinema: "Cinema",
    library: "Library",
    golf_course: "Golf course",
    consulate: "Consulate",
    park: "Park",
    "same-first-letter-station": "Station (first letter)",
    "same-length-station": "Station (name length)",
    "same-train-line": "Train line",
};

const MATCHING_BASIC_TYPES: MatchingBasicType[] = [
    "zone",
    "letter-zone",
    "airport",
    "major-city",
];

const MATCHING_POI_TYPES: MatchingPOIType[] = [
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
];

interface Props {
    data: MatchingData;
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
                    borderColor: selected ? colors.MATCHING : "#e5e7eb",
                    backgroundColor: selected ? "#fffbeb" : "#fff",
                },
            ]}
        >
            <Ionicons
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                size={20}
                color={selected ? colors.MATCHING : "#9ca3af"}
            />
            <Text
                style={{
                    flex: 1,
                    fontSize: 16,
                    color: selected ? "#92400e" : "#374151",
                    fontWeight: selected ? "600" : "400",
                }}
            >
                {MATCHING_TYPE_LABELS[type] ?? type}
            </Text>
        </Pressable>
    );
}

export function MatchingEditor({ data, editingKey, onPickLocationOnMap }: Props) {
    return (
        <View className="gap-4 px-4">
            {/* Zone Type selector */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Zone Type
                </Text>
                <Text className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                    Basic
                </Text>
                {MATCHING_BASIC_TYPES.map((type) => (
                    <TypeRow
                        key={type}
                        type={type}
                        selected={data.type === type}
                        onPress={() => {
                            (data as any).type = type;
                            if (
                                type === "zone" ||
                                type === "letter-zone"
                            ) {
                                if (!(data as any).cat) {
                                    (data as any).cat = { adminLevel: 4 };
                                }
                            }
                            questionModified();
                        }}
                    />
                ))}
                <Text className="text-xs text-gray-400 uppercase tracking-wide font-medium mt-1">
                    Home Game
                </Text>
                {MATCHING_POI_TYPES.map((type) => (
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

            {/* Admin level picker — only for zone / letter-zone */}
            {(data.type === "zone" || data.type === "letter-zone") && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Admin Level
                    </Text>
                    <View style={editorStyles.segmentRow}>
                        {([2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map(
                            (level) => {
                                const selected =
                                    (data as any).cat?.adminLevel === level;
                                return (
                                    <Pressable
                                        key={level}
                                        onPress={() => {
                                            if (!(data as any).cat)
                                                (data as any).cat = {};
                                            (data as any).cat.adminLevel =
                                                level;
                                            questionModified();
                                        }}
                                        style={[
                                            editorStyles.segmentItem,
                                            selected && {
                                                backgroundColor:
                                                    colors.MATCHING,
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
                                            {level}
                                        </Text>
                                    </Pressable>
                                );
                            },
                        )}
                    </View>
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
        </View>
    );
}
