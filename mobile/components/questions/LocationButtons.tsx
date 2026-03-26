import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { Alert, Text, View } from "react-native";

import { ActionButton } from "../ActionButton";
import { questionModified } from "../../lib/context";
import { formatCoord, parseCoordinatesFromText } from "./utils";

interface Props {
    color: string;
    lat: number;
    lng: number;
    editingKey: number;
    field?: "A" | "B";
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
    /** Called with the new lat/lng when the user sets the location. */
    onUpdate: (lat: number, lng: number) => void;
}

/**
 * Reusable 4-button location row: Select on Map / Set to Current / Copy / Paste.
 * Renders the coordinate display line below the buttons.
 */
export function LocationButtons({
    color,
    lat,
    lng,
    editingKey,
    field,
    onPickLocationOnMap,
    onUpdate,
}: Props) {
    return (
        <>
            <View className="flex-row gap-2">
                <ActionButton
                    vertical
                    icon="map-outline"
                    label="Select"
                    color={color}
                    numberOfLines={1}
                    onPress={() => onPickLocationOnMap?.(editingKey, field)}
                />
                <ActionButton
                    vertical
                    icon="locate-outline"
                    label="Set to Current"
                    color={color}
                    numberOfLines={1}
                    onPress={async () => {
                        const { status } =
                            await Location.requestForegroundPermissionsAsync();
                        if (status !== "granted") {
                            Alert.alert(
                                "Permission denied",
                                "Location permission is required.",
                            );
                            return;
                        }
                        const pos = await Location.getCurrentPositionAsync({
                            accuracy: Location.Accuracy.Balanced,
                        });
                        onUpdate(pos.coords.latitude, pos.coords.longitude);
                        questionModified();
                    }}
                />
                <ActionButton
                    vertical
                    icon="copy-outline"
                    label="Copy"
                    color={color}
                    onPress={async () => {
                        const text = `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lng)}°${lng >= 0 ? "E" : "W"}`;
                        await Clipboard.setStringAsync(text);
                    }}
                />
                <ActionButton
                    vertical
                    icon="clipboard-outline"
                    label="Paste"
                    color={color}
                    onPress={async () => {
                        const text = await Clipboard.getStringAsync();
                        const parsed = parseCoordinatesFromText(text);
                        if (parsed.lat !== null && parsed.lng !== null) {
                            onUpdate(parsed.lat, parsed.lng);
                            questionModified();
                        } else {
                            Alert.alert(
                                "No coordinates found",
                                "Copy a coordinate pair to your clipboard first.",
                            );
                        }
                    }}
                />
            </View>

            <Text className="text-center text-sm text-gray-500">
                {formatCoord(lat, lng)}
            </Text>
        </>
    );
}
