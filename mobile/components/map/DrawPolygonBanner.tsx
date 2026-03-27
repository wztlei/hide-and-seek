import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    topInset: number;
    vertexCount: number;
    onFinish: () => void;
    onCancel: () => void;
}

/**
 * Floating banner shown while the user is drawing a custom polygon zone.
 * Matches the position and style of HidingZonePoiPrompt.
 */
export function DrawPolygonBanner({
    topInset,
    vertexCount,
    onFinish,
    onCancel,
}: Props) {
    const canFinish = vertexCount >= 3;
    const label = `Draw zone (${vertexCount} point${vertexCount === 1 ? "" : "s"})`;

    return (
        <View
            style={[
                styles.banner,
                { top: topInset + 16, backgroundColor: colors.PRIMARY },
            ]}
            pointerEvents="box-none"
        >
            <Ionicons name="pencil-outline" size={20} color="white" />
            <Text
                className="flex-1 text-white text-[15px] font-semibold"
                numberOfLines={1}
            >
                {label}
            </Text>
            {canFinish && (
                <Pressable
                    onPress={onFinish}
                    hitSlop={8}
                    className="bg-white rounded-lg px-3 py-1.5"
                >
                    <Text
                        className="font-bold text-sm"
                        style={{ color: colors.PRIMARY }}
                    >
                        Finish
                    </Text>
                </Pressable>
            )}
            <Pressable onPress={onCancel} hitSlop={8}>
                <Ionicons name="close-circle" size={26} color="white" />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: "absolute",
        left: 16,
        right: 16,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
});
