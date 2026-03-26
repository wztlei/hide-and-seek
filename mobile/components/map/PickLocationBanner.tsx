import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    pendingCoord: [number, number] | null;
    topInset: number;
    /** Cancel the pick and return to the edit panel without changing the coord */
    onCancel: () => void;
    /** Confirm the tapped coord — parent writes it to the question and closes */
    onConfirm: () => void;
    /** Clear the tapped coord so the user can tap again */
    onRetap: () => void;
}

/**
 * Floating banner overlay rendered during map-pick mode.
 *
 * Phase 1 (pendingCoord === null): "Tap the map to set location" with a cancel ×
 * Phase 2 (pendingCoord set): shows the tapped coordinate with Confirm and × to retap
 *
 * Positioned absolutely at the top of the screen, above the map tiles.
 * Uses `pointerEvents="box-none"` on the parent so map taps pass through
 * the transparent area around the banner.
 */
export function PickLocationBanner({
    pendingCoord,
    topInset,
    onCancel,
    onConfirm,
    onRetap,
}: Props) {
    return (
        <View
            style={[
                styles.banner,
                {
                    top: topInset + 16,
                    backgroundColor: colors.PRIMARY,
                },
            ]}
            pointerEvents="box-none"
        >
            {pendingCoord === null ? (
                // Phase 1: waiting for a tap
                <>
                    <Ionicons name="map-outline" size={20} color="white" />
                    <Text className="flex-1 text-white text-[15px] font-semibold">
                        Tap the map to set location
                    </Text>
                    <Pressable onPress={onCancel} hitSlop={8}>
                        <Ionicons name="close-circle" size={26} color="white" />
                    </Pressable>
                </>
            ) : (
                // Phase 2: location tapped — confirm or re-tap
                <>
                    <Text className="flex-1 text-white text-[13px] font-semibold">
                        {`${Math.abs(pendingCoord[1]).toFixed(4)}° ${pendingCoord[1] >= 0 ? "N" : "S"}, ${Math.abs(pendingCoord[0]).toFixed(4)}° ${pendingCoord[0] >= 0 ? "E" : "W"}`}
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
                            Confirm
                        </Text>
                    </Pressable>
                    <Pressable onPress={onRetap} hitSlop={8}>
                        <Ionicons name="close-circle" size={26} color="white" />
                    </Pressable>
                </>
            )}
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
