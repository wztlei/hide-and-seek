import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    topInset: number;
    onConfirm: () => void;
    onDismiss: () => void;
}

/**
 * Floating banner shown when the user taps a hiding zone transit stop dot.
 * Offers to add a radius question centred on that stop.
 * Matches the position and style of PickLocationBanner.
 */
export function HidingZonePoiPrompt({ topInset, onConfirm, onDismiss }: Props) {
    return (
        <View
            style={[
                styles.banner,
                { top: topInset + 16, backgroundColor: colors.PRIMARY },
            ]}
            pointerEvents="box-none"
        >
            <Ionicons name="bus-outline" size={20} color="white" />
            <Text className="flex-1 text-white text-[15px] font-semibold">
                Add radius question at this stop?
            </Text>
            <Pressable
                onPress={onConfirm}
                hitSlop={8}
                style={styles.confirmButton}
            >
                <Text
                    className="font-bold text-sm"
                    style={{ color: colors.PRIMARY }}
                >
                    Add
                </Text>
            </Pressable>
            <Pressable onPress={onDismiss} hitSlop={8}>
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
    confirmButton: {
        backgroundColor: "white",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
});
