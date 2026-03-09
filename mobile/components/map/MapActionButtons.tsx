import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    bottomInset: number;
    isLoadingZone: boolean;
    onQuestionsPress: () => void;
    onZonePress: () => void;
    onLocatePress: () => void;
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
}: Props) {
    return (
        <>
            <Pressable
                onPress={onQuestionsPress}
                style={{ bottom: bottomInset + 159 }}
                className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
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
                style={{ bottom: bottomInset + 87 }}
                className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
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
                style={{ bottom: bottomInset + 15 }}
                className="absolute right-4 w-14 h-14 rounded-full bg-white/90 items-center justify-center shadow active:opacity-70"
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
