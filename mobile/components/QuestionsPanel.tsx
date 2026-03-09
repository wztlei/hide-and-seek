import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetBackdrop,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
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

function colorForType(type: Question["id"]): string {
    switch (type) {
        case "radius":      return colors.RADIUS;
        case "thermometer": return colors.THERMOMETER;
        case "tentacles":   return colors.TENTACLES;
        case "matching":    return colors.MATCHING;
        case "measuring":   return colors.MEASURING;
        default:            return colors.PRIMARY;
    }
}

/** Light background tint for the question-type icon chip (Screen 2). */
function bgColorForType(type: Question["id"]): string {
    switch (type) {
        case "radius":      return "#fee2e2"; // red-100
        case "thermometer": return "#f3e8ff"; // purple-100
        case "tentacles":   return "#dcfce7"; // green-100
        case "matching":    return "#fef3c7"; // amber-100
        case "measuring":   return "#cffafe"; // cyan-100
        default:            return "#e0e7ff"; // indigo-100
    }
}

function subtitleForQuestion(q: Question): string | null {
    if (q.id === "radius") {
        const { radius, unit, lat, lng, within } = q.data;
        const unitLabel =
            unit === "miles" ? "mi" : unit === "kilometers" ? "km" : "m";
        const coord = formatCoord(lat, lng);
        return `${within === false ? "Outside" : "Inside"} ${radius} ${unitLabel} · ${coord}`;
    }
    if (q.id === "thermometer") {
        const { latA, lngA, warmer } = q.data;
        return `${warmer ? "Warmer" : "Colder"} · A: ${formatCoord(latA, lngA)}`;
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
        case "thermometer": {
            const dest = turf.destination([lng, lat], 1, Math.random() * 360, { units: "miles" });
            const [lngB, latB] = dest.geometry.coordinates;
            return {
                id: "thermometer" as const,
                data: { latA: lat, lngA: lng, latB, lngB, warmer: true },
            };
        }
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
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
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
    // Key of a question that has been added to the store but not yet confirmed by
    // the user. While draftKey is set the Screen 3 heading reads "Add Question"
    // and a confirm button is shown. Going back or closing discards the draft.
    const [draftKey, setDraftKey] = useState<number | null>(null);
    // True when the BottomSheet is being closed programmatically (e.g. for
    // pick-mode). Prevents the onChange handler from discarding the draft.
    const isProgrammaticCloseRef = useRef(false);

    const editData = useMemo(
        () =>
            editingKey !== null
                ? ($questions.find((q) => q.key === editingKey) ?? null)
                : null,
        [editingKey, $questions],
    );

    const isAddMode = draftKey !== null && draftKey === editingKey;

    // Sync panel open/close; restore edit screen when returning from map-pick mode
    useEffect(() => {
        if (visible) {
            isProgrammaticCloseRef.current = false;
            sheetRef.current?.expand();
            if (initialEditKey != null) {
                setEditingKey(initialEditKey);
                slideX.setValue(-SCREEN_WIDTH * 2);
            } else {
                slideX.setValue(0);
            }
        } else {
            // Mark as programmatic so handleSheetChange won't discard the draft
            // (pick-mode closes the panel temporarily and will reopen it).
            isProgrammaticCloseRef.current = true;
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
            if (index === -1) {
                // User swiped the sheet closed (not a programmatic close for pick-mode).
                // Discard any in-progress draft.
                if (!isProgrammaticCloseRef.current && draftKey !== null) {
                    questions.set(
                        (questions.get() as Questions).filter(
                            (q) => q.key !== draftKey,
                        ),
                    );
                    setDraftKey(null);
                }
                onClose();
            }
        },
        [onClose, draftKey],
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

    function discardDraft() {
        if (draftKey !== null) {
            questions.set(
                (questions.get() as Questions).filter(
                    (q) => q.key !== draftKey,
                ),
            );
            setDraftKey(null);
        }
    }

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
            id === "radius" || id === "thermometer"
                ? (userCoord ?? (await getMapCenter()))
                : await getMapCenter();
        addQuestion(defaultPayloadForType(id, center));
        if (id === "radius" || id === "thermometer") {
            const allQ = questions.get();
            const newKey = allQ[allQ.length - 1].key;
            setDraftKey(newKey);
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
                                        color={colorForType(q.id)}
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
                                <View
                                    className="w-11 h-11 rounded-xl items-center justify-center"
                                    style={{ backgroundColor: bgColorForType(id) }}
                                >
                                    <Ionicons
                                        name={icon}
                                        size={24}
                                        color={colorForType(id)}
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

                {/* ── Screen 3: Add / Edit Question ──────────────────────────────── */}
                <View style={styles.screen}>
                    <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                        <Pressable
                            onPress={() => {
                                if (isAddMode) {
                                    // Discard the draft and return to the type picker
                                    discardDraft();
                                    goBack();
                                } else {
                                    goBackToList();
                                }
                            }}
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
                            {isAddMode ? "Add Question" : "Edit Question"}
                        </Text>
                        <Pressable
                            onPress={() => {
                                discardDraft();
                                onClose();
                            }}
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
                                                            selected && { backgroundColor: colors.RADIUS },
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
                                                        selected && { backgroundColor: colors.RADIUS },
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
                                                color={colors.RADIUS}
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
                                                color={colors.RADIUS}
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
                                                color={colors.RADIUS}
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
                                                color={colors.RADIUS}
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
                        ) : editData?.id === "thermometer" ? (
                            <View className="gap-4 px-4">
                                {/* Point A */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        Start (Point A)
                                    </Text>
                                    <View className="flex-row gap-2">
                                        <Pressable
                                            onPress={() => {
                                                if (editingKey !== null) requestAnimationFrame(() => onPickLocationOnMap?.(editingKey, "A"));
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="map-outline" size={20} color={colors.THERMOMETER_A} />
                                            <Text className="text-xs mt-1 text-gray-500">Select on Map</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={async () => {
                                                const { status } = await Location.requestForegroundPermissionsAsync();
                                                if (status !== "granted") {
                                                    Alert.alert("Permission denied", "Location permission is required.");
                                                    return;
                                                }
                                                const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                                                if (editData?.id === "thermometer") {
                                                    editData.data.latA = pos.coords.latitude;
                                                    editData.data.lngA = pos.coords.longitude;
                                                    questionModified();
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="locate-outline" size={20} color={colors.THERMOMETER_A} />
                                            <Text className="text-xs mt-1 text-gray-500">Set to Current</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={async () => {
                                                const text = await Clipboard.getStringAsync();
                                                const { lat, lng } = parseCoordinatesFromText(text);
                                                if (lat !== null && lng !== null && editData?.id === "thermometer") {
                                                    editData.data.latA = lat;
                                                    editData.data.lngA = lng;
                                                    questionModified();
                                                } else {
                                                    Alert.alert("No coordinates found", "Copy a coordinate pair to your clipboard first.");
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="clipboard-outline" size={20} color={colors.THERMOMETER_A} />
                                            <Text className="text-xs mt-1 text-gray-500">Paste</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={async () => {
                                                if (editData?.id === "thermometer") {
                                                    const text = `${Math.abs(editData.data.latA)}°${editData.data.latA >= 0 ? "N" : "S"}, ${Math.abs(editData.data.lngA)}°${editData.data.lngA >= 0 ? "E" : "W"}`;
                                                    await Clipboard.setStringAsync(text);
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="copy-outline" size={20} color={colors.THERMOMETER_A} />
                                            <Text className="text-xs mt-1 text-gray-500">Copy</Text>
                                        </Pressable>
                                    </View>
                                    <Text className="text-center text-sm text-gray-500">
                                        {formatCoord(editData.data.latA, editData.data.lngA)}
                                    </Text>
                                </View>

                                {/* Point B */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        End (Point B)
                                    </Text>
                                    <View className="flex-row gap-2">
                                        <Pressable
                                            onPress={() => {
                                                if (editingKey !== null) requestAnimationFrame(() => onPickLocationOnMap?.(editingKey, "B"));
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="map-outline" size={20} color={colors.THERMOMETER_B} />
                                            <Text className="text-xs mt-1 text-gray-500">Select on Map</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={async () => {
                                                const { status } = await Location.requestForegroundPermissionsAsync();
                                                if (status !== "granted") {
                                                    Alert.alert("Permission denied", "Location permission is required.");
                                                    return;
                                                }
                                                const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                                                if (editData?.id === "thermometer") {
                                                    editData.data.latB = pos.coords.latitude;
                                                    editData.data.lngB = pos.coords.longitude;
                                                    questionModified();
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="locate-outline" size={20} color={colors.THERMOMETER_B} />
                                            <Text className="text-xs mt-1 text-gray-500">Set to Current</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={async () => {
                                                const text = await Clipboard.getStringAsync();
                                                const { lat, lng } = parseCoordinatesFromText(text);
                                                if (lat !== null && lng !== null && editData?.id === "thermometer") {
                                                    editData.data.latB = lat;
                                                    editData.data.lngB = lng;
                                                    questionModified();
                                                } else {
                                                    Alert.alert("No coordinates found", "Copy a coordinate pair to your clipboard first.");
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="clipboard-outline" size={20} color={colors.THERMOMETER_B} />
                                            <Text className="text-xs mt-1 text-gray-500">Paste</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={async () => {
                                                if (editData?.id === "thermometer") {
                                                    const text = `${Math.abs(editData.data.latB)}°${editData.data.latB >= 0 ? "N" : "S"}, ${Math.abs(editData.data.lngB)}°${editData.data.lngB >= 0 ? "E" : "W"}`;
                                                    await Clipboard.setStringAsync(text);
                                                }
                                            }}
                                            style={styles.locationBtn}
                                            className="active:opacity-70"
                                        >
                                            <Ionicons name="copy-outline" size={20} color={colors.THERMOMETER_B} />
                                            <Text className="text-xs mt-1 text-gray-500">Copy</Text>
                                        </Pressable>
                                    </View>
                                    <Text className="text-center text-sm text-gray-500">
                                        {formatCoord(editData.data.latB, editData.data.lngB)}
                                    </Text>
                                </View>

                                {/* Distance */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        Distance
                                    </Text>
                                    <Text className="text-base text-gray-700">
                                        {turf.distance(
                                            [editData.data.lngA, editData.data.latA],
                                            [editData.data.lngB, editData.data.latB],
                                            { units: "miles" },
                                        ).toFixed(2)} miles
                                    </Text>
                                </View>

                                {/* Result */}
                                <View className="gap-2">
                                    <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                        Result
                                    </Text>
                                    <View style={styles.segmentRow}>
                                        {([true, false] as const).map((val) => {
                                            const selected = editData.data.warmer === val;
                                            return (
                                                <Pressable
                                                    key={String(val)}
                                                    onPress={() => {
                                                        editData.data.warmer = val;
                                                        questionModified();
                                                    }}
                                                    style={[
                                                        styles.segmentItem,
                                                        styles.segmentItemWide,
                                                        selected && { backgroundColor: colors.THERMOMETER },
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.segmentText,
                                                            selected && styles.segmentTextSelected,
                                                        ]}
                                                    >
                                                        {val ? "Warmer (closer to B)" : "Colder (closer to A)"}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            </View>
                        ) : editData != null ? (
                            <Text className="text-center text-gray-400 mt-10">
                                Editing {labelForType(editData.id)} questions is
                                not yet supported on mobile.
                            </Text>
                        ) : null}
                    </BottomSheetScrollView>

                    {isAddMode && (
                        <View
                            className="p-4 border-t border-gray-100"
                            style={{ paddingBottom: insets.bottom + 16 }}
                        >
                            <Pressable
                                onPress={() => {
                                    setDraftKey(null);
                                    goBackToList();
                                }}
                                className="flex-row items-center justify-center h-12 rounded-xl gap-2 active:opacity-80"
                                style={{ backgroundColor: editData ? colorForType(editData.id) : colors.PRIMARY }}
                            >
                                <Ionicons
                                    name="checkmark-circle-outline"
                                    size={20}
                                    color="#fff"
                                />
                                <Text className="text-white text-base font-semibold">
                                    Submit
                                </Text>
                            </Pressable>
                        </View>
                    )}
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
