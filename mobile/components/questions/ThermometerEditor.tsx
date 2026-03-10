import * as turf from "@turf/turf";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/colors";
import { questionModified } from "../../lib/context";
import type { Questions } from "../../../src/maps/schema";
import { LocationButtons } from "./LocationButtons";
import { editorStyles } from "./editorStyles";

type ThermometerData = Extract<
    Questions[number],
    { id: "thermometer" }
>["data"];

interface Props {
    data: ThermometerData;
    editingKey: number;
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
}

export function ThermometerEditor({
    data,
    editingKey,
    onPickLocationOnMap,
}: Props) {
    return (
        <View className="gap-4 px-4">
            {/* Point A */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Start (Point A)
                </Text>
                <LocationButtons
                    color={colors.THERMOMETER_A}
                    lat={data.latA}
                    lng={data.lngA}
                    editingKey={editingKey}
                    field="A"
                    onPickLocationOnMap={onPickLocationOnMap}
                    onUpdate={(lat, lng) => {
                        data.latA = lat;
                        data.lngA = lng;
                    }}
                />
            </View>

            {/* Point B */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    End (Point B)
                </Text>
                <LocationButtons
                    color={colors.THERMOMETER_B}
                    lat={data.latB}
                    lng={data.lngB}
                    editingKey={editingKey}
                    field="B"
                    onPickLocationOnMap={onPickLocationOnMap}
                    onUpdate={(lat, lng) => {
                        data.latB = lat;
                        data.lngB = lng;
                    }}
                />
            </View>

            {/* Distance */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Distance
                </Text>
                <Text className="text-base text-gray-700">
                    {turf
                        .distance(
                            [data.lngA, data.latA],
                            [data.lngB, data.latB],
                            { units: "miles" },
                        )
                        .toFixed(2)}{" "}
                    miles
                </Text>
            </View>

            {/* Result */}
            <View className="gap-2">
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Result
                </Text>
                <View style={editorStyles.segmentRow}>
                    {([true, false] as const).map((val) => {
                        const selected = data.warmer === val;
                        return (
                            <Pressable
                                key={String(val)}
                                onPress={() => {
                                    data.warmer = val;
                                    questionModified();
                                }}
                                style={[
                                    editorStyles.segmentItem,
                                    editorStyles.segmentItemWide,
                                    selected && {
                                        backgroundColor: colors.THERMOMETER,
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
                                    {val
                                        ? "Warmer (closer to B)"
                                        : "Colder (closer to A)"}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}
