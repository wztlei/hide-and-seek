import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "../../lib/colors";

interface Props {
    /** [lng, lat] of the draft marker */
    coord: [number, number];
    topInset: number;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}

/**
 * Two-row banner shown after the user taps the map to place a draft custom POI.
 * Row 1: coordinate display + cancel ×
 * Row 2: name TextInput + Add button (disabled until name is non-empty)
 */
export function CustomPOIConfirmBanner({
    coord,
    topInset,
    onConfirm,
    onCancel,
}: Props) {
    const [name, setName] = useState("");
    const [lng, lat] = coord;
    const coordText = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? "E" : "W"}`;
    const canConfirm = name.trim().length > 0;

    return (
        <View
            style={[styles.banner, { top: topInset + 16 }]}
            pointerEvents="box-none"
        >
            {/* Row 1: coord + cancel */}
            <View style={styles.row}>
                <Ionicons name="location-outline" size={18} color="white" />
                <Text
                    className="flex-1 text-white text-[13px] font-medium"
                    numberOfLines={1}
                >
                    {coordText}
                </Text>
                <Pressable onPress={onCancel} hitSlop={8}>
                    <Ionicons name="close-circle" size={24} color="white" />
                </Pressable>
            </View>

            {/* Row 2: name input + add */}
            <View style={styles.row}>
                <TextInput
                    style={styles.input}
                    placeholder="Name this location…"
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    value={name}
                    onChangeText={setName}
                    returnKeyType="done"
                    onSubmitEditing={() =>
                        canConfirm && onConfirm(name.trim())
                    }
                    autoFocus
                />
                <Pressable
                    onPress={() => canConfirm && onConfirm(name.trim())}
                    hitSlop={8}
                    style={[
                        styles.addButton,
                        !canConfirm && styles.addButtonDisabled,
                    ]}
                >
                    <Text
                        className="font-bold text-sm"
                        style={{
                            color: canConfirm ? colors.PRIMARY : "#9ca3af",
                        }}
                    >
                        Add
                    </Text>
                </Pressable>
            </View>
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
        paddingVertical: 10,
        gap: 12,
        backgroundColor: colors.PRIMARY,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    input: {
        flex: 1,
        color: "white",
        fontSize: 15,
        paddingVertical: 0,
    },
    addButton: {
        backgroundColor: "white",
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    addButtonDisabled: {
        backgroundColor: "rgba(255,255,255,0.3)",
    },
});
