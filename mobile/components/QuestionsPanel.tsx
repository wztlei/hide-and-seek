import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetBackdrop,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/colors";
import { addQuestion, questions, questionModified } from "../lib/context";
import type { Question, Questions } from "../../src/maps/schema";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Question type metadata ────────────────────────────────────────────────────

type QuestionId =
    | "radius"
    | "thermometer"
    | "tentacles"
    | "matching"
    | "measuring";

const QUESTION_TYPES: Array<{
    id: QuestionId;
    label: string;
    subtitle: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
}> = [
    {
        id: "radius",
        label: "Radius",
        subtitle: "Is the hider within a set distance of a point?",
        icon: "disc-outline",
    },
    {
        id: "thermometer",
        label: "Thermometer",
        subtitle: "Is the hider closer to point A or point B?",
        icon: "thermometer-outline",
    },
    {
        id: "tentacles",
        label: "Tentacles",
        subtitle: "Is the hider within range of a type of place?",
        icon: "pie-chart-outline",
    },
    {
        id: "matching",
        label: "Matching",
        subtitle: "Is the hider in the same zone or near the same feature?",
        icon: "copy-outline",
    },
    {
        id: "measuring",
        label: "Measuring",
        subtitle: "Is the hider closer to a feature than the seeker?",
        icon: "resize-outline",
    },
];

function iconForType(
    type: Question["id"],
): React.ComponentProps<typeof Ionicons>["name"] {
    return (
        QUESTION_TYPES.find((q) => q.id === type)?.icon ?? "help-circle-outline"
    );
}

function labelForType(type: Question["id"]): string {
    return QUESTION_TYPES.find((q) => q.id === type)?.label ?? type;
}

function subtitleForQuestion(q: Question): string | null {
    if (q.id === "radius") {
        const { radius, unit, lat, lng, within } = q.data;
        const unitLabel =
            unit === "miles" ? "mi" : unit === "kilometers" ? "km" : "m";
        const coord = formatCoord(lat, lng);
        return `${within === false ? "Outside" : "Inside"} ${radius} ${unitLabel} · ${coord}`;
    }
    return null;
}

// ── Default payloads ──────────────────────────────────────────────────────────

function defaultPayloadForType(
    id: QuestionId,
    center?: [number, number] | null,
) {
    const lng = center?.[0] ?? 0;
    const lat = center?.[1] ?? 0;
    switch (id) {
        case "radius":
            return {
                id: "radius" as const,
                data: { lat, lng, radius: 1, unit: "miles" as const },
            };
        case "thermometer":
            return {
                id: "thermometer" as const,
                data: { latA: lat, lngA: lng, latB: lat, lngB: lng + 0.1 },
            };
        case "tentacles":
            return { id: "tentacles" as const, data: { lat, lng } };
        case "matching":
            return {
                id: "matching" as const,
                data: { lat, lng, type: "airport" as const },
            };
        case "measuring":
            return {
                id: "measuring" as const,
                data: { lat, lng, type: "coastline" as const },
            };
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCoord(lat: number, lng: number): string {
    const latDir = lat >= 0 ? "N" : "S";
    const lngDir = lng >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

function parseCoordinatesFromText(text: string): {
    lat: number | null;
    lng: number | null;
} {
    const decimalPattern = /(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/;
    const dmsPattern =
        /(\d+)°\s*(\d+)['′]?\s*(?:(\d+(?:\.\d+)?)["″]?\s*)?([NS])[,\s]+(\d+)°\s*(\d+)['′]?\s*(?:(\d+(?:\.\d+)?)["″]?\s*)?([EW])/i;
    const decimalCardinalPattern =
        /(\d+[.,]\d+)°\s*([NS])\s*,\s*(\d+[.,]\d+)°\s*([EW])/i;

    const decimalMatch = text.match(decimalPattern);
    if (decimalMatch) {
        return {
            lat: parseFloat(decimalMatch[1].replace(",", ".")),
            lng: parseFloat(decimalMatch[2].replace(",", ".")),
        };
    }
    const dmsMatch = text.match(dmsPattern);
    if (dmsMatch) {
        let lat =
            parseInt(dmsMatch[1]) +
            parseInt(dmsMatch[2]) / 60 +
            (parseFloat(dmsMatch[3]) || 0) / 3600;
        let lng =
            parseInt(dmsMatch[5]) +
            parseInt(dmsMatch[6]) / 60 +
            (parseFloat(dmsMatch[7]) || 0) / 3600;
        if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
        if (dmsMatch[8].toUpperCase() === "W") lng = -lng;
        return { lat, lng };
    }
    const cardinalMatch = text.match(decimalCardinalPattern);
    if (cardinalMatch) {
        let lat = parseFloat(cardinalMatch[1].replace(",", "."));
        let lng = parseFloat(cardinalMatch[3].replace(",", "."));
        if (cardinalMatch[2].toUpperCase() === "S") lat = -lat;
        if (cardinalMatch[4].toUpperCase() === "W") lng = -lng;
        return { lat, lng };
    }
    return { lat: null, lng: null };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    visible: boolean;
    onClose: () => void;
    getMapCenter: () => Promise<[number, number] | null>;
    userCoord?: [number, number] | null;
    initialEditKey?: number | null;
    onPickLocationOnMap?: (key: number) => void;
}

export function QuestionsPanel({
    visible,
    onClose,
    getMapCenter,
    userCoord,
    initialEditKey,
    onPickLocationOnMap,
}: Props) {
    const insets = useSafeAreaInsets();
    const $questions = useStore(questions) as Questions;

    const sheetRef = useRef<BottomSheet>(null);
    const slideX = useRef(new Animated.Value(0)).current;

    const [editingKey, setEditingKey] = useState<number | null>(null);
    const [radiusText, setRadiusText] = useState("1");

    const editData = useMemo(
        () =>
            editingKey !== null
                ? ($questions.find((q) => q.key === editingKey) ?? null)
                : null,
        [editingKey, $questions],
    );

    // Sync panel open/close; restore edit screen when returning from map-pick mode
    useEffect(() => {
        if (visible) {
            sheetRef.current?.expand();
            if (initialEditKey != null) {
                setEditingKey(initialEditKey);
                slideX.setValue(-SCREEN_WIDTH * 2);
            } else {
                slideX.setValue(0);
            }
        } else {
            sheetRef.current?.close();
            setEditingKey(null);
        }
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    // Jump to Screen 3 when initialEditKey is set (e.g. tapped map marker)
    useEffect(() => {
        if (initialEditKey != null) {
            setEditingKey(initialEditKey);
            slideX.setValue(-SCREEN_WIDTH * 2);
        }
    }, [initialEditKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync radiusText when switching between questions
    useEffect(() => {
        if (editData?.id === "radius") {
            setRadiusText(String(editData.data.radius));
        }
    }, [editingKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSheetChange = useCallback(
        (index: number) => {
            if (index === -1) onClose();
        },
        [onClose],
    );

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

    function goToAddQuestion() {
        Animated.spring(slideX, {
            toValue: -SCREEN_WIDTH,
            useNativeDriver: true,
        }).start();
    }

    function goBack() {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
    }

    function goToEdit(key: number) {
        setEditingKey(key);
        Animated.spring(slideX, {
            toValue: -SCREEN_WIDTH * 2,
            useNativeDriver: true,
        }).start();
    }

    function goBackToList() {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
    }

    async function handleAddQuestion(id: QuestionId) {
        const center =
            id === "radius"
                ? (userCoord ?? (await getMapCenter()))
                : await getMapCenter();
        addQuestion(defaultPayloadForType(id, center));
        if (id === "radius") {
            const allQ = questions.get();
            const newKey = allQ[allQ.length - 1].key;
            goToEdit(newKey);
        } else {
            goBack();
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={["100%"]}
            enableDynamicSizing={false}
            topInset={insets.top}
            enablePanDownToClose
            onClose={onClose}
            onChange={handleSheetChange}
            backdropComponent={renderBackdrop}
            handleIndicatorStyle={styles.handleIndicator}
            backgroundStyle={styles.sheetBackground}
        >
            {/* Sliding inner container — three screens side by side */}
            <Animated.View
                style={[
                    styles.innerRow,
                    { transform: [{ translateX: slideX }] },
                ]}
            >
                {/* ── Screen 1: Questions list ────────────────────────────────────── */}
                <View style={styles.screen}>
                    <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                        <Text className="flex-1 text-2xl font-semibold text-gray-800">
                            Questions
                        </Text>
                        <Pressable
                            onPress={onClose}
                            hitSlop={8}
                            className="p-1 active:opacity-60"
                        >
                            <Ionicons name="close" size={24} color="#555" />
                        </Pressable>
                    </View>

                    <BottomSheetScrollView
                        className="flex-1"
                        contentContainerStyle={{ paddingVertical: 8 }}
                    >
                        {$questions.length === 0 ? (
                            <Text className="text-center text-gray-400 text-lg mt-10">
                                No questions yet
                            </Text>
                        ) : (
                            $questions.map((q, i) => (
                                <Pressable
                                    key={q.key ?? i}
                                    onPress={() => goToEdit(q.key)}
                                    className="flex-row items-center px-4 py-3 gap-4 border-b border-gray-100 active:bg-gray-50"
                                >
                                    <Ionicons
                                        name={iconForType(q.id)}
                                        size={22}
                                        color={colors.PRIMARY}
                                    />
                                    <View className="flex-1 gap-0.5">
                                        <Text className="text-lg font-medium text-gray-800">
                                            {labelForType(q.id)}
                                        </Text>
                                        {subtitleForQuestion(q) && (
                                            <Text className="text-sm text-gray-400" numberOfLines={1}>
                                                {subtitleForQuestion(q)}
                                            </Text>
                                        )}
                                    </View>
                                    <Pressable
                                        onPress={() => {
                                            Alert.alert(
                                                "Delete Question",
                                                `Remove this ${labelForType(q.id)} question?`,
                                                [
                                                    {
                                                        text: "Cancel",
                                                        style: "cancel",
                                                    },
                                                    {
                                                        text: "Delete",
                                                        style: "destructive",
                                                        onPress: () => {
                                                            questions.set(
                                                                questions
                                                                    .get()
                                                                    .filter(
                                                                        (x) =>
                                                                            x.key !==
                                                                            q.key,
                                                                    ),
                                                            );
                                                            questionModified();
                                                        },
                                                    },
                                                ],
                                            );
                                        }}
                                        hitSlop={8}
                                        className="p-1 active:opacity-50"
                                    >
                                        <Ionicons
                                            name="trash-outline"
                                            size={18}
                                            color="#9ca3af"
                                        />
                                    </Pressable>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={18}
                                        color="#d1d5db"
                                    />
                                </Pressable>
                            ))
                        )}
                    </BottomSheetScrollView>

                    <View
                        className="p-4 border-t border-gray-100"
                        style={{ paddingBottom: insets.bottom + 16 }}
                    >
                        <Pressable
                            onPress={goToAddQuestion}
                            className="flex-row items-center justify-center h-12 rounded-xl gap-2 active:opacity-80"
                            style={{ backgroundColor: colors.PRIMARY }}
                        >
                            <Ionicons
                                name="add-circle-outline"
                                size={20}
                                color="#fff"
                            />
                            <Text className="text-white text-base font-semibold">
                                Add Question
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* ── Screen 2: Add Question picker ──────────────────────────────── */}
                <View style={styles.screen}>
                    <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                        <Pressable
                            onPress={goBack}
                            hitSlop={8}
                            className="p-1 mr-2 active:opacity-60"
                        >
                            <Ionicons
                                name="chevron-back"
                                size={24}
                                color="#555"
                            />
                        </Pressable>
                        <Text className="flex-1 text-xl font-semibold text-gray-800">
                            Add Question
                        </Text>
                        <Pressable
                            onPress={onClose}
                            hitSlop={8}
                            className="p-1 active:opacity-60"
                        >
                            <Ionicons name="close" size={24} color="#555" />
                        </Pressable>
                    </View>

                    <BottomSheetScrollView
                        contentContainerStyle={{ paddingVertical: 8 }}
                    >
                        {QUESTION_TYPES.map(({ id, label, subtitle, icon }) => (
                            <Pressable
                                key={id}
                                onPress={() => handleAddQuestion(id)}
                                className="flex-row items-center px-4 py-3.5 gap-3.5 border-b border-gray-100 active:bg-gray-50"
                            >
                                <View className="w-11 h-11 rounded-xl bg-blue-50 items-center justify-center">
                                    <Ionicons
                                        name={icon}
                                        size={24}
                                        color={colors.PRIMARY}
                                    />
                                </View>
                                <View className="flex-1 gap-0.5">
                                    <Text className="text-base font-semibold text-gray-800">
                                        {label}
                                    </Text>
                                    <Text className="text-sm text-gray-500 leading-snug">
                                        {subtitle}
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={18}
                                    color="#d1d5db"
                                />
                            </Pressable>
                        ))}
                    </BottomSheetScrollView>
                </View>

                {/* ── Screen 3: Edit Question ─────────────────────────────────────── */}
                <View style={styles.screen}>
                    <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                        <Pressable
                            onPress={goBackToList}
                            hitSlop={8}
                            className="p-1 mr-2 active:opacity-60"
                        >
                            <Ionicons
                                name="chevron-back"
                                size={24}
                                color="#555"
                            />
                        </Pressable>
                        <Text className="flex-1 text-xl font-semibold text-gray-800">
                            Edit Question
                        </Text>
                        <Pressable
                            onPress={onClose}
                            hitSlop={8}
                            className="p-1 active:opacity-60"
                        >
                            <Ionicons name="close" size={24} color="#555" />
                        </Pressable>
                    </View>

                    <BottomSheetScrollView
                        contentContainerStyle={{ paddingVertical: 16 }}
                    >
                        {editData?.id === "radius" ? (
                            <View className="gap-4 px-4">
                                {/* Radius value + unit */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        Radius
                                    </Text>
                                    <View className="flex-row items-center gap-3">
                                        <TextInput
                                            value={radiusText}
                                            onChangeText={(text) => {
                                                setRadiusText(text);
                                                const n = parseFloat(text);
                                                if (
                                                    !isNaN(n) &&
                                                    n >= 0 &&
                                                    editData?.id === "radius"
                                                ) {
                                                    editData.data.radius = n;
                                                    questionModified();
                                                }
                                            }}
                                            keyboardType="numeric"
                                            style={styles.radiusInput}
                                            selectTextOnFocus
                                        />
                                        {/* Unit segmented control */}
                                        <View style={styles.segmentRow}>
                                            {(
                                                [
                                                    "miles",
                                                    "kilometers",
                                                    "meters",
                                                ] as const
                                            ).map((u) => {
                                                const selected =
                                                    editData.data.unit === u;
                                                const label =
                                                    u === "miles"
                                                        ? "mi"
                                                        : u === "kilometers"
                                                          ? "km"
                                                          : "m";
                                                return (
                                                    <Pressable
                                                        key={u}
                                                        onPress={() => {
                                                            editData.data.unit =
                                                                u;
                                                            questionModified();
                                                        }}
                                                        style={[
                                                            styles.segmentItem,
                                                            selected &&
                                                                styles.segmentItemSelected,
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.segmentText,
                                                                selected &&
                                                                    styles.segmentTextSelected,
                                                            ]}
                                                        >
                                                            {label}
                                                        </Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>

                                {/* Result: Inside / Outside */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        Result
                                    </Text>
                                    <View style={styles.segmentRow}>
                                        {([true, false] as const).map((val) => {
                                            const selected =
                                                editData.data.within === val;
                                            return (
                                                <Pressable
                                                    key={String(val)}
                                                    onPress={() => {
                                                        editData.data.within =
                                                            val;
                                                        questionModified();
                                                    }}
                                                    style={[
                                                        styles.segmentItem,
                                                        styles.segmentItemWide,
                                                        selected &&
                                                            styles.segmentItemSelected,
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.segmentText,
                                                            selected &&
                                                                styles.segmentTextSelected,
                                                        ]}
                                                    >
                                                        {val
                                                            ? "Inside"
                                                            : "Outside"}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Location */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        Location
                                    </Text>
                                    <View className="flex-row gap-2">
                                        {/* Pick on map */}
                                        <Pressable
                                            onPress={() => {
                                                if (editingKey !== null) {
                                                    onPickLocationOnMap?.(
                                                        editingKey,
                                                    );
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons
                                                name="map-outline"
                                                size={20}
                                                color={colors.PRIMARY}
                                            />
                                            <Text className="text-xs mt-1 text-gray-500">
                                                Select on Map
                                            </Text>
                                        </Pressable>
                                        {/* Use current location */}
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
                                                const pos =
                                                    await Location.getCurrentPositionAsync(
                                                        {
                                                            accuracy:
                                                                Location
                                                                    .Accuracy
                                                                    .Balanced,
                                                        },
                                                    );
                                                if (editData?.id === "radius") {
                                                    editData.data.lat =
                                                        pos.coords.latitude;
                                                    editData.data.lng =
                                                        pos.coords.longitude;
                                                    questionModified();
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons
                                                name="locate-outline"
                                                size={20}
                                                color={colors.PRIMARY}
                                            />
                                            <Text className="text-xs mt-1 text-gray-500">
                                              Set to Current
                                            </Text>
                                        </Pressable>
                                        {/* Paste from clipboard */}
                                        <Pressable
                                            onPress={async () => {
                                                const text =
                                                    await Clipboard.getStringAsync();
                                                const { lat, lng } =
                                                    parseCoordinatesFromText(
                                                        text,
                                                    );
                                                if (
                                                    lat !== null &&
                                                    lng !== null &&
                                                    editData?.id === "radius"
                                                ) {
                                                    editData.data.lat = lat;
                                                    editData.data.lng = lng;
                                                    questionModified();
                                                } else {
                                                    Alert.alert(
                                                        "No coordinates found",
                                                        "Copy a coordinate pair to your clipboard first.",
                                                    );
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons
                                                name="clipboard-outline"
                                                size={20}
                                                color={colors.PRIMARY}
                                            />
                                            <Text className="text-xs mt-1 text-gray-500">
                                                Paste
                                            </Text>
                                        </Pressable>
                                        {/* Copy to clipboard */}
                                        <Pressable
                                            onPress={async () => {
                                                if (editData?.id === "radius") {
                                                    const text = `${Math.abs(editData.data.lat)}°${editData.data.lat >= 0 ? "N" : "S"}, ${Math.abs(editData.data.lng)}°${editData.data.lng >= 0 ? "E" : "W"}`;
                                                    await Clipboard.setStringAsync(
                                                        text,
                                                    );
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons
                                                name="copy-outline"
                                                size={20}
                                                color={colors.PRIMARY}
                                            />
                                            <Text className="text-xs mt-1 text-gray-500">
                                                Copy
                                            </Text>
                                        </Pressable>
                                    </View>
                                    <Text className="text-center text-sm text-gray-500">
                                        {formatCoord(
                                            editData.data.lat,
                                            editData.data.lng,
                                        )}
                                    </Text>
                                </View>
                            </View>
                        ) : editData != null ? (
                            <Text className="text-center text-gray-400 mt-10">
                                Editing {labelForType(editData.id)} questions is
                                not yet supported on mobile.
                            </Text>
                        ) : null}
                    </BottomSheetScrollView>
                </View>
            </Animated.View>
        </BottomSheet>
    );
}

// StyleSheet only for values NativeWind cannot express:
// - BottomSheet style props (third-party, no className support)
// - Animated.View dynamic pixel widths
// - TextInput / segmented control styling
const styles = StyleSheet.create({
    sheetBackground: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    handleIndicator: {
        backgroundColor: "#d1d5db",
        width: 36,
    },
    innerRow: {
        flexDirection: "row",
        width: SCREEN_WIDTH * 3,
        flex: 1,
        overflow: "hidden",
    },
    screen: {
        width: SCREEN_WIDTH,
        flex: 1,
    },
    radiusInput: {
        width: 80,
        height: 44,
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 10,
        paddingHorizontal: 12,
        fontSize: 18,
        color: "#1f2937",
        backgroundColor: "#fff",
        textAlign: "center",
    },
    segmentRow: {
        flexDirection: "row",
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 10,
        overflow: "hidden",
        flex: 1,
    },
    segmentItem: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    segmentItemWide: {
        flex: 1,
    },
    segmentItemSelected: {
        backgroundColor: colors.PRIMARY,
    },
    segmentText: {
        fontSize: 14,
        fontWeight: "500",
        color: "#6b7280",
    },
    segmentTextSelected: {
        color: "#fff",
        fontWeight: "600",
    },
    locationBtn: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 10,
        backgroundColor: "#fff",
    },
});
