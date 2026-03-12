import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    bottomInset: number;
    isLoadingZone: boolean;
    onQuestionsPress: () => void;
    onZonePress: () => void;
    onLocatePress: () => void;
    onSettingsPress: () => void;
}

/**
 * The three circular FABs stacked on the right side of the map:
 *  - Questions (chatbox icon) — opens the QuestionsPanel bottom sheet
 *  - Zone selector (map icon / spinner) — opens the PlacePicker modal
 *  - Locate (locate icon) — flies the camera to the user's GPS position
 *
 * Bottom positions are calculated from the safe-area inset so they clear
 * the home indicator on notchless devices.
 */
export function MapActionButtons({
    bottomInset,
    isLoadingZone,
    onQuestionsPress,
    onZonePress,
    onLocatePress,
    onSettingsPress,
}: Props) {
    return (
        <>
            <Pressable
                onPress={onSettingsPress}
                style={[styles.fab, { bottom: bottomInset + 231 }]}
                hitSlop={8}
            >
                <Ionicons
                    name="settings-outline"
                    size={24}
                    color={colors.PRIMARY}
                />
            </Pressable>

            <Pressable
                onPress={onQuestionsPress}
                style={[styles.fab, { bottom: bottomInset + 159 }]}
                hitSlop={8}
            >
                <Ionicons
                    name="chatbox-ellipses-outline"
                    size={24}
                    color={colors.PRIMARY}
                />
            </Pressable>

            <Pressable
                onPress={onZonePress}
                style={[styles.fab, { bottom: bottomInset + 87 }]}
                hitSlop={8}
            >
                {isLoadingZone ? (
                    <ActivityIndicator size="small" color={colors.PRIMARY} />
                ) : (
                    <Ionicons
                        name="map-outline"
                        size={24}
                        color={colors.PRIMARY}
                    />
                )}
            </Pressable>

            <Pressable
                onPress={onLocatePress}
                style={[styles.fab, { bottom: bottomInset + 15 }]}
                hitSlop={8}
            >
                <Ionicons
                    name="locate-outline"
                    size={24}
                    color={colors.PRIMARY}
                />
            </Pressable>
        </>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: "absolute",
        right: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "rgba(255,255,255,0.9)",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
});
