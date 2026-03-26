import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useRef } from "react";
import * as Clipboard from "expo-clipboard";
import { Alert, Pressable, Text, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Feature, Point } from "geojson";
import { customPOIs, excludedPOIs } from "../lib/context";
import { colors } from "../lib/colors";

const POI_TYPES: { label: string; value: string }[] = [
    { label: "Aquarium", value: "aquarium" },
    { label: "Zoo", value: "zoo" },
    { label: "Theme park", value: "theme_park" },
    { label: "Mountain", value: "peak" },
    { label: "Museum", value: "museum" },
    { label: "Hospital", value: "hospital" },
    { label: "Cinema", value: "cinema" },
    { label: "Library", value: "library" },
    { label: "Golf course", value: "golf_course" },
    { label: "Consulate", value: "consulate" },
    { label: "Park", value: "park" },
];

interface Props {
    visible: boolean;
    /** Currently-active POI type (null = none selected) */
    selectedType: string | null;
    /** Updates customPOIMode in MapView */
    onSelectType: (type: string) => void;
    /** Exits custom POI mode */
    onClose: () => void;
    /** Number of Overpass-fetched POIs for the selected type */
    overpassCount: number;
}

export function CustomPOIPanel({
    visible,
    selectedType,
    onSelectType,
    onClose,
    overpassCount,
}: Props) {
    const sheetRef = useRef<BottomSheet>(null);
    const insets = useSafeAreaInsets();
    const isProgrammaticCloseRef = useRef(false);
    const $customPOIs = useStore(customPOIs);
    const $excludedPOIs = useStore(excludedPOIs);

    useEffect(() => {
        if (visible) {
            isProgrammaticCloseRef.current = false;
            sheetRef.current?.expand();
        } else {
            isProgrammaticCloseRef.current = true;
            sheetRef.current?.close();
        }
    }, [visible]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
            />
        ),
        [],
    );

    const customCount = selectedType
        ? ($customPOIs[selectedType]?.length ?? 0)
        : 0;
    const excludedCount = selectedType
        ? ($excludedPOIs[selectedType]?.length ?? 0)
        : 0;
    const selectedLabel =
        POI_TYPES.find((t) => t.value === selectedType)?.label ?? "";

    const handleCopyType = async () => {
        if (!selectedType) return;
        const custom = ($customPOIs[selectedType] ?? []).map((f) => ({
            lng: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
            id: (f as Feature<Point, { id: string }>).properties?.id,
        }));
        const excluded = $excludedPOIs[selectedType] ?? [];
        await Clipboard.setStringAsync(
            JSON.stringify({
                v: 1,
                scope: "type",
                type: selectedType,
                custom,
                excluded,
            }),
        );
        Alert.alert("Copied", `Copied ${selectedLabel} POI data to clipboard.`);
    };

    const handlePasteType = async () => {
        const text = await Clipboard.getStringAsync();
        try {
            const data = JSON.parse(text);
            if (data?.v !== 1 || data?.scope !== "type") {
                Alert.alert(
                    "Invalid Data",
                    "Clipboard does not contain valid POI data.",
                );
                return;
            }
            const type = data.type as string;
            const incomingCustom: { lng: number; lat: number; id: string }[] =
                data.custom ?? [];
            const incomingExcluded: string[] = data.excluded ?? [];
            // Merge custom POIs (no duplicate IDs)
            const existingCustom = customPOIs.get()[type] ?? [];
            const existingIds = new Set(
                existingCustom.map(
                    (f) => (f as Feature<Point, { id: string }>).properties?.id,
                ),
            );
            const newFeatures = incomingCustom
                .filter((p) => !existingIds.has(p.id))
                .map(
                    (p): Feature<Point> => ({
                        type: "Feature",
                        geometry: {
                            type: "Point",
                            coordinates: [p.lng, p.lat],
                        },
                        properties: { id: p.id, name: "Custom" },
                    }),
                );
            customPOIs.set({
                ...customPOIs.get(),
                [type]: [...existingCustom, ...newFeatures],
            });
            // Merge excluded POIs
            const existingExcluded = excludedPOIs.get()[type] ?? [];
            const existingExcludedSet = new Set(existingExcluded);
            const newExcluded = incomingExcluded.filter(
                (id) => !existingExcludedSet.has(id),
            );
            excludedPOIs.set({
                ...excludedPOIs.get(),
                [type]: [...existingExcluded, ...newExcluded],
            });
            Alert.alert(
                "Imported",
                `Added ${newFeatures.length} custom POIs and ${newExcluded.length} exclusions.`,
            );
        } catch {
            Alert.alert("Error", "Could not parse clipboard data.");
        }
    };

    const handleCopyAll = async () => {
        const custom: Record<
            string,
            { lng: number; lat: number; id: string }[]
        > = {};
        for (const [type, features] of Object.entries($customPOIs)) {
            custom[type] = features.map((f) => ({
                lng: f.geometry.coordinates[0],
                lat: f.geometry.coordinates[1],
                id: (f as Feature<Point, { id: string }>).properties?.id,
            }));
        }
        await Clipboard.setStringAsync(
            JSON.stringify({
                v: 1,
                scope: "all",
                custom,
                excluded: $excludedPOIs,
            }),
        );
        Alert.alert("Copied", "Copied all custom POI data to clipboard.");
    };

    const handlePasteAll = async () => {
        const text = await Clipboard.getStringAsync();
        try {
            const data = JSON.parse(text);
            if (data?.v !== 1 || data?.scope !== "all") {
                Alert.alert(
                    "Invalid Data",
                    "Clipboard does not contain valid POI data.",
                );
                return;
            }
            let totalNew = 0;
            let totalExcluded = 0;
            const nextCustom = { ...customPOIs.get() };
            const nextExcluded = { ...excludedPOIs.get() };
            for (const [type, features] of Object.entries<
                { lng: number; lat: number; id: string }[]
            >(data.custom ?? {})) {
                const existing = nextCustom[type] ?? [];
                const existingIds = new Set(
                    existing.map(
                        (f) =>
                            (f as Feature<Point, { id: string }>).properties
                                ?.id,
                    ),
                );
                const newFeatures = features
                    .filter((p) => !existingIds.has(p.id))
                    .map(
                        (p): Feature<Point> => ({
                            type: "Feature",
                            geometry: {
                                type: "Point",
                                coordinates: [p.lng, p.lat],
                            },
                            properties: { id: p.id, name: "Custom" },
                        }),
                    );
                nextCustom[type] = [...existing, ...newFeatures];
                totalNew += newFeatures.length;
            }
            for (const [type, ids] of Object.entries<string[]>(
                data.excluded ?? {},
            )) {
                const existing = nextExcluded[type] ?? [];
                const existingSet = new Set(existing);
                const newIds = ids.filter((id) => !existingSet.has(id));
                nextExcluded[type] = [...existing, ...newIds];
                totalExcluded += newIds.length;
            }
            customPOIs.set(nextCustom);
            excludedPOIs.set(nextExcluded);
            Alert.alert(
                "Imported",
                `Added ${totalNew} custom POIs and ${totalExcluded} exclusions.`,
            );
        } catch {
            Alert.alert("Error", "Could not parse clipboard data.");
        }
    };

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={["65%"]}
            enableDynamicSizing={false}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            onChange={(index) => {
                if (index === -1 && !isProgrammaticCloseRef.current) {
                    onClose();
                }
                isProgrammaticCloseRef.current = false;
            }}
        >
            <BottomSheetScrollView
                contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: insets.bottom + 16,
                }}
            >
                {/* Header */}
                <View className="flex-row items-baseline justify-between mb-4 mt-1">
                    <Text className="text-xl font-bold text-gray-900">
                        Custom POI Locations
                    </Text>
                </View>

                <Text className="text-base leading-6 text-gray-700 mb-4">
                    Add, import and export custom points of interest.
                </Text>

                {/* Type dropdown */}
                <View className="mb-4">
                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        POI Type
                    </Text>
                    <Dropdown
                        data={POI_TYPES}
                        labelField="label"
                        valueField="value"
                        value={selectedType}
                        onChange={(item) => onSelectType(item.value)}
                        placeholder="Select a type…"
                        style={dropdownContainerStyle}
                        selectedTextStyle={dropdownSelectedTextStyle}
                        activeColor="#ecfeff"
                    />
                </View>

                {/* Status + instructions (only when type is selected) */}
                {selectedType !== null && (
                    <>
                        <View className="flex-row flex-wrap items-center mb-2">
                            <Text className="text-base text-gray-700">
                                <Text
                                    className="font-semibold"
                                    style={{ color: "#22c55e" }}
                                >
                                    {customCount} custom
                                </Text>
                                {"  ·  "}
                                <Text
                                    className="font-semibold"
                                    style={{ color: colors.PRIMARY }}
                                >
                                    {overpassCount} fetched
                                </Text>
                                {excludedCount > 0 && (
                                    <Text className="text-gray-500">
                                        {" "}
                                        ({excludedCount} excluded)
                                    </Text>
                                )}
                            </Text>
                        </View>

                        <View className="flex-row items-center gap-1.5 rounded-lg px-3 py-2 mb-4 bg-indigo-50">
                            <Ionicons
                                name="information-circle-outline"
                                size={16}
                                color={colors.PRIMARY}
                            />
                            <Text className="text-sm text-indigo-700">
                                Tap map to add · Tap POI to remove
                            </Text>
                        </View>

                        {/* Per-type import / export */}
                        <View className="flex-row gap-2 mb-2">
                            <Pressable
                                onPress={handleCopyType}
                                className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 active:opacity-70"
                            >
                                <Ionicons
                                    name="copy-outline"
                                    size={16}
                                    color="#555"
                                />
                                <Text
                                    className="text-base text-gray-700"
                                    numberOfLines={1}
                                >
                                    Copy {selectedLabel} POIs
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handlePasteType}
                                className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 active:opacity-70"
                            >
                                <Ionicons
                                    name="clipboard-outline"
                                    size={16}
                                    color="#555"
                                />
                                <Text
                                    className="text-base text-gray-700"
                                    numberOfLines={1}
                                >
                                    Paste {selectedLabel} POIs
                                </Text>
                            </Pressable>
                        </View>
                    </>
                )}

                {/* Divider */}
                <View className="h-px bg-gray-100 my-4" />

                {/* All custom POIs import / export */}
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    All Custom POIs
                </Text>
                <View className="flex-row gap-2 mb-6">
                    <Pressable
                        onPress={handleCopyAll}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 active:opacity-70"
                    >
                        <Ionicons name="copy-outline" size={16} color="#555" />
                        <Text className="text-base text-gray-700">
                            Copy All Custom POIs
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={handlePasteAll}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 active:opacity-70"
                    >
                        <Ionicons
                            name="clipboard-outline"
                            size={16}
                            color="#555"
                        />
                        <Text className="text-base text-gray-700">
                            Paste Custom POIs
                        </Text>
                    </Pressable>
                </View>

                {/* Done button */}
                <Pressable
                    onPress={onClose}
                    className="flex-row items-center justify-center h-12 rounded-xl active:opacity-80"
                    style={{ backgroundColor: colors.PRIMARY }}
                >
                    <Text className="text-white text-base font-semibold">
                        Done
                    </Text>
                </Pressable>
            </BottomSheetScrollView>
        </BottomSheet>
    );
}

const dropdownContainerStyle = {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#fff",
} as const;

const dropdownSelectedTextStyle = {
    fontSize: 16,
    color: "#111827",
} as const;
