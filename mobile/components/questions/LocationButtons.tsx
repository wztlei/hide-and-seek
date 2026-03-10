import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { Alert, Pressable, Text, View } from "react-native";

import { questionModified } from "../../lib/context";
import { editorStyles } from "./editorStyles";
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
 * Reusable 4-button location row: Select on Map / Set to Current / Paste / Copy.
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
                <Pressable
                    onPress={() => onPickLocationOnMap?.(editingKey, field)}
                    style={editorStyles.locationBtn}
                    className="active:opacity-70"
                >
                    <Ionicons name="map-outline" size={20} color={color} />
                    <Text className="text-xs mt-1 text-gray-500">
                        Select on Map
                    </Text>
                </Pressable>

                <Pressable
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
                    style={editorStyles.locationBtn}
                    className="active:opacity-70"
                >
                    <Ionicons name="locate-outline" size={20} color={color} />
                    <Text className="text-xs mt-1 text-gray-500">
                        Set to Current
                    </Text>
                </Pressable>

                <Pressable
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
                    style={editorStyles.locationBtn}
                    className="active:opacity-70"
                >
                    <Ionicons
                        name="clipboard-outline"
                        size={20}
                        color={color}
                    />
                    <Text className="text-xs mt-1 text-gray-500">Paste</Text>
                </Pressable>

                <Pressable
                    onPress={async () => {
                        const text = `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lng)}°${lng >= 0 ? "E" : "W"}`;
                        await Clipboard.setStringAsync(text);
                    }}
                    style={editorStyles.locationBtn}
                    className="active:opacity-70"
                >
                    <Ionicons name="copy-outline" size={20} color={color} />
                    <Text className="text-xs mt-1 text-gray-500">Copy</Text>
                </Pressable>
            </View>

            <Text className="text-center text-sm text-gray-500">
                {formatCoord(lat, lng)}
            </Text>
        </>
    );
}
