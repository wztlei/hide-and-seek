import { Pressable, Text, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";

import type { Questions } from "../../../src/maps/schema";
import { colors } from "../../lib/colors";
import { questionModified } from "../../lib/context";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type MatchingData = Extract<Questions[number], { id: "matching" }>["data"];

type DropdownItem =
    | { isHeader: true; label: string; value: string }
    | { isHeader?: false; label: string; value: string };

const DROPDOWN_DATA: DropdownItem[] = [
    { isHeader: true, label: "Basic", value: "__header_basic" },
    { label: "Admin zone", value: "zone" },
    { label: "Letter zone", value: "letter-zone" },
    { label: "Airport", value: "airport" },
    { label: "Major city", value: "major-city" },
    { isHeader: true, label: "Home Game", value: "__header_home" },
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
}

export function MatchingEditor({ data, editingKey, onPickLocationOnMap }: Props) {
    const selectedItem = SELECTABLE_DATA.find((d) => d.value === (data as any).type);

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
                        if (item.value === "zone" || item.value === "letter-zone") {
                            if (!(data as any).cat) (data as any).cat = { adminLevel: 4 };
                        }
                        questionModified();
                    }}
                    renderItem={(item) => {
                        if (item.isHeader) {
                            return (
                                <View style={groupHeaderStyle}>
                                    <Text style={groupHeaderTextStyle}>{item.label}</Text>
                                </View>
                            );
                        }
                        const selected = item.value === (data as any).type;
                        return (
                            <View style={[dropdownItemStyle, selected && { backgroundColor: "#fffbeb" }]}>
                                <Text style={[dropdownItemTextStyle, selected && { color: "#92400e", fontWeight: "600" }]}>
                                    {item.label}
                                </Text>
                            </View>
                        );
                    }}
                    style={dropdownStyle.container}
                    selectedTextStyle={dropdownStyle.selectedText}
                    activeColor="#fffbeb"
                    placeholder="Select type…"
                />
            </View>

            {/* Admin level picker — only for zone / letter-zone */}
            {((data as any).type === "zone" || (data as any).type === "letter-zone") && (
                <View className="gap-2">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Admin Level
                    </Text>
                    <View style={editorStyles.segmentRow}>
                        {([2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((level) => {
                            const selected = (data as any).cat?.adminLevel === level;
                            return (
                                <Pressable
                                    key={level}
                                    onPress={() => {
                                        if (!(data as any).cat) (data as any).cat = {};
                                        (data as any).cat.adminLevel = level;
                                        questionModified();
                                    }}
                                    style={[
                                        editorStyles.segmentItem,
                                        selected && { backgroundColor: colors.MATCHING },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            editorStyles.segmentText,
                                            selected && editorStyles.segmentTextSelected,
                                        ]}
                                    >
                                        {level}
                                    </Text>
                                </Pressable>
                            );
                        })}
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
                                    selected && { backgroundColor: colors.MATCHING },
                                ]}
                            >
                                <Text
                                    style={[
                                        editorStyles.segmentText,
                                        selected && editorStyles.segmentTextSelected,
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
