import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { colors } from "../../lib/colors";
import { questionModified } from "../../lib/context";
import type { Questions } from "../../../src/maps/schema";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type RadiusData = Extract<Questions[number], { id: "radius" }>["data"];

interface Props {
    data: RadiusData;
    editingKey: number;
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
}

export function RadiusEditor({ data, editingKey, onPickLocationOnMap }: Props) {
    const [radiusText, setRadiusText] = useState(String(data.radius));

    return (
        <View className="gap-4 px-4">
            {/* Radius value + unit */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Radius
                </Text>
                <View className="flex-row items-center gap-3">
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
                        style={editorStyles.radiusInput}
                        selectTextOnFocus
                    />
                    <View style={editorStyles.segmentRow}>
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
                                                backgroundColor: colors.RADIUS,
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

            {/* Result: Inside / Outside */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Result
                </Text>
                <View style={editorStyles.segmentRow}>
                    {([true, false] as const).map((val) => {
                        const selected = data.within === val;
                        return (
                            <Pressable
                                key={String(val)}
                                onPress={() => {
                                    data.within = val;
                                    questionModified();
                                }}
                                style={[
                                    editorStyles.segmentItem,
                                    editorStyles.segmentItemWide,
                                    selected && {
                                        backgroundColor: colors.RADIUS,
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
                                    {val ? "Inside" : "Outside"}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            {/* Location */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Location
                </Text>
                <LocationButtons
                    color={colors.RADIUS}
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
