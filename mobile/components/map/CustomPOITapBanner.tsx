import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    topInset: number;
    typeName: string;
    onDone: () => void;
}

/**
 * Floating banner shown while the user is tapping the map to add/remove
 * custom POIs. Matches the style of DrawPolygonBanner.
 */
export function CustomPOITapBanner({ topInset, typeName, onDone }: Props) {
    return (
        <View
            style={[styles.banner, { top: topInset + 16 }]}
            pointerEvents="box-none"
        >
            <Ionicons name="location-outline" size={20} color="white" />
            <Text
                className="flex-1 text-white text-[15px] font-semibold"
                numberOfLines={1}
            >
                Tap map to add/remove POIs
            </Text>
            <Pressable
                onPress={onDone}
                hitSlop={8}
                className="bg-white rounded-lg px-3 py-1.5"
            >
                <Text
                    className="font-bold text-sm"
                    style={{ color: colors.PRIMARY }}
                >
                    Done
                </Text>
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
        backgroundColor: colors.PRIMARY,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
});
