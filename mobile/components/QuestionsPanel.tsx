import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetBackdrop,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/colors";
import { addQuestion, questions, questionModified } from "../lib/context";
import { draftQuestion } from "../lib/draftQuestion";
import {
    questionSchema,
    type Question,
    type Questions,
} from "../../src/maps/schema";

import { MatchingEditor } from "./questions/MatchingEditor";
import { MeasuringEditor } from "./questions/MeasuringEditor";
import { RadiusEditor } from "./questions/RadiusEditor";
import { TentaclesEditor } from "./questions/TentaclesEditor";
import { ThermometerEditor } from "./questions/ThermometerEditor";

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
        icon: "reorder-two-outline",
    },
    {
        id: "measuring",
        label: "Measuring",
        subtitle: "Is the hider closer to a feature than the seeker?",
        icon: "resize-outline",
    },
];

const LOCATION_TYPE_LABELS: Record<string, string> = {
    theme_park: "Theme Parks",
    zoo: "Zoos",
    aquarium: "Aquariums",
    museum: "Museums",
    hospital: "Hospitals",
    cinema: "Movie Theaters",
    library: "Libraries",
};

const MATCHING_TYPE_LABELS: Record<string, string> = {
    zone: "Administrative zone",
    airport: "Airport",
    "major-city": "Major city",
    aquarium: "Aquarium",
    zoo: "Zoo",
    theme_park: "Theme park",
    peak: "Peak",
    museum: "Museum",
    hospital: "Hospital",
    cinema: "Cinema",
    library: "Library",
    golf_course: "Golf course",
    consulate: "Consulate",
    park: "Park",
    "same-first-letter-station": "Station (first letter)",
    "same-length-station": "Station (name length)",
    "same-train-line": "Train line",
};

const MEASURING_TYPE_LABELS: Record<string, string> = {
    coastline: "Coastline",
    airport: "Airport",
    city: "City",
    "highspeed-measure-shinkansen": "High-speed rail",
    aquarium: "Aquarium",
    zoo: "Zoo",
    theme_park: "Theme park",
    peak: "Mountain",
    museum: "Museum",
    hospital: "Hospital",
    cinema: "Cinema",
    library: "Library",
    golf_course: "Golf course",
    consulate: "Consulate",
    park: "Park",
    mcdonalds: "McDonald's",
    seven11: "7-Eleven",
    "rail-measure": "Train station",
};

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
        case "radius":
            return colors.RADIUS;
        case "thermometer":
            return colors.THERMOMETER;
        case "tentacles":
            return colors.TENTACLES;
        case "matching":
            return colors.MATCHING;
        case "measuring":
            return colors.MEASURING;
        default:
            return colors.PRIMARY;
    }
}

function bgColorForType(type: Question["id"]): string {
    switch (type) {
        case "radius":
            return "#fee2e2";
        case "thermometer":
            return "#f3e8ff";
        case "tentacles":
            return "#dcfce7";
        case "matching":
            return "#fef3c7";
        case "measuring":
            return "#cffafe";
        default:
            return "#e0e7ff";
    }
}

function subtitleForQuestion(q: Question): string | null {
    if (q.id === "radius") {
        const { radius, unit, lat, lng, within } = q.data;
        const unitLabel =
            unit === "miles" ? "mi" : unit === "kilometers" ? "km" : "m";
        const latDir = lat >= 0 ? "N" : "S";
        const lngDir = lng >= 0 ? "E" : "W";
        const coord = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
        return `${within === false ? "Outside" : "Inside"} ${radius} ${unitLabel} · ${coord}`;
    }
    if (q.id === "thermometer") {
        const { latA, lngA, warmer } = q.data;
        const dir = latA >= 0 ? "N" : "S";
        const lngDir = lngA >= 0 ? "E" : "W";
        return `${warmer ? "Warmer" : "Colder"} · A: ${Math.abs(latA).toFixed(4)}° ${dir}, ${Math.abs(lngA).toFixed(4)}° ${lngDir}`;
    }
    if (q.id === "tentacles") {
        if (!q.data.within) return "Outside";
        const label =
            LOCATION_TYPE_LABELS[q.data.locationType] ?? q.data.locationType;
        const loc =
            q.data.location !== false
                ? ((q.data.location as any).properties?.name ?? "Selected")
                : "None selected";
        return `Inside · ${label} · ${loc}`;
    }
    if (q.id === "matching") {
        const type = (q.data as any).type as string;
        if (!type) return "Select a zone type";
        const typeLabel = MATCHING_TYPE_LABELS[type] ?? type;
        const adminSuffix =
            type === "zone" && (q.data as any).cat?.adminLevel
                ? ` · admin level ${(q.data as any).cat.adminLevel}`
                : "";
        return `${q.data.same ? "Same" : "Different"} · ${typeLabel}${adminSuffix}`;
    }
    if (q.id === "measuring") {
        const type = (q.data as any).type as string;
        if (!type) return "Select a feature type";
        const typeLabel = MEASURING_TYPE_LABELS[type] ?? type;
        return `${q.data.hiderCloser ? "Closer" : "Farther"} · ${typeLabel}`;
    }
    return null;
}

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
            const dest = turf.destination([lng, lat], 1, Math.random() * 360, {
                units: "miles",
            });
            const [lngB, latB] = dest.geometry.coordinates;
            return {
                id: "thermometer" as const,
                data: { latA: lat, lngA: lng, latB, lngB, warmer: true },
            };
        }
        case "tentacles":
            return {
                id: "tentacles" as const,
                data: {
                    lat,
                    lng,
                    radius: 1,
                    unit: "miles" as const,
                    within: false,
                    locationType: "hospital" as const,
                    location: false as const,
                },
            };
        case "matching":
            return {
                id: "matching" as const,
                data: {
                    lat,
                    lng,
                    type: "zone" as const,
                    same: true,
                    drag: false,
                    color: "blue" as const,
                    collapsed: false,
                    cat: { adminLevel: 4 as const },
                },
            };
        case "measuring":
            return {
                id: "measuring" as const,
                data: {
                    lat,
                    lng,
                    type: "coastline" as const,
                    hiderCloser: true,
                    drag: false,
                    color: "blue" as const,
                    collapsed: false,
                },
            };
    }
}

// ── Component ─────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Props {
    visible: boolean;
    onClose: () => void;
    getMapCenter: () => [number, number] | null;
    userCoord?: [number, number] | null;
    initialEditKey?: number | null;
    onPickLocationOnMap?: (key: number, field?: "A" | "B") => void;
}

export const QuestionsPanel = memo(function QuestionsPanel({
    visible,
    onClose,
    getMapCenter,
    userCoord,
    initialEditKey,
    onPickLocationOnMap,
}: Props) {
    const posthog = usePostHog();
    const insets = useSafeAreaInsets();
    const $questions = useStore(questions) as Questions;

    const sheetRef = useRef<BottomSheet>(null);
    const slideX = useRef(new Animated.Value(0)).current;

    const [editingKey, setEditingKey] = useState<number | null>(null);
    // Prevents the onChange handler from discarding the draft on programmatic close.
    const isProgrammaticCloseRef = useRef(false);

    const $draftQuestion = useStore(draftQuestion);

    const editData = useMemo(() => {
        if (editingKey === null) return null;
        if ($draftQuestion?.key === editingKey) return $draftQuestion;
        return $questions.find((q) => q.key === editingKey) ?? null;
    }, [editingKey, $questions, $draftQuestion]);

    const isAddMode =
        $draftQuestion !== null && $draftQuestion.key === editingKey;

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

    const handleSheetChange = useCallback(
        (index: number) => {
            if (index === -1) {
                if (!isProgrammaticCloseRef.current) {
                    draftQuestion.set(null);
                }
                onClose();
            }
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

    function discardDraft() {
        draftQuestion.set(null);
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

    function handleAddQuestion(id: QuestionId) {
        const center = userCoord ?? getMapCenter();
        const parsed = questionSchema.parse(defaultPayloadForType(id, center));
        draftQuestion.set(parsed);
        posthog?.capture("question_add_started", { question_type: id });
        goToEdit(parsed.key);
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
            <Animated.View
                className="flex-row flex-1 overflow-hidden"
                style={[
                    { width: SCREEN_WIDTH * 3 },
                    { transform: [{ translateX: slideX }] },
                ]}
            >
                {/* ── Screen 1: Questions list ─────────────────────────────── */}
                <View className="flex-1" style={{ width: SCREEN_WIDTH }}>
                    <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                        <Text className="flex-1 text-2xl font-semibold text-gray-800">
                            Questions
                        </Text>
                        {$questions.length > 0 && (
                            <Pressable
                                onPress={() =>
                                    Alert.alert(
                                        "Clear All Questions",
                                        "Remove all questions?",
                                        [
                                            { text: "Cancel", style: "cancel" },
                                            {
                                                text: "Clear All",
                                                style: "destructive",
                                                onPress: () => {
                                                    posthog?.capture("questions_cleared", {
                                                        count: $questions.length,
                                                    });
                                                    questions.set([]);
                                                    questionModified();
                                                },
                                            },
                                        ],
                                    )
                                }
                                hitSlop={8}
                                className="px-2 py-1 active:opacity-60"
                            >
                                <Text className="text-base text-red-500">
                                    Clear all
                                </Text>
                            </Pressable>
                        )}
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
                                            <Text
                                                className="text-sm text-gray-400"
                                                numberOfLines={1}
                                            >
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
                                                            posthog?.capture("question_deleted", { question_type: q.id });
                                                            questions.set(
                                                                (
                                                                    questions.get() as Questions
                                                                ).filter(
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

                {/* ── Screen 2: Add Question picker ────────────────────────── */}
                <View className="flex-1" style={{ width: SCREEN_WIDTH }}>
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
                                    style={{
                                        backgroundColor: bgColorForType(id),
                                    }}
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

                {/* ── Screen 3: Add / Edit Question ────────────────────────── */}
                <View className="flex-1" style={{ width: SCREEN_WIDTH }}>
                    <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
                        <Pressable
                            onPress={() => {
                                if (isAddMode) {
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
                        {!isAddMode && editData && (
                            <Pressable
                                onPress={() => {
                                    Alert.alert(
                                        "Delete Question",
                                        `Remove this ${labelForType(editData.id)} question?`,
                                        [
                                            {
                                                text: "Cancel",
                                                style: "cancel",
                                            },
                                            {
                                                text: "Delete",
                                                style: "destructive",
                                                onPress: () => {
                                                    posthog?.capture("question_deleted", { question_type: editData.id });
                                                    questions.set(
                                                        (
                                                            questions.get() as Questions
                                                        ).filter(
                                                            (x) =>
                                                                x.key !==
                                                                editingKey,
                                                        ),
                                                    );
                                                    questionModified();
                                                    goBackToList();
                                                },
                                            },
                                        ],
                                    );
                                }}
                                hitSlop={8}
                                className="p-1 mr-2 active:opacity-60"
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={22}
                                    color="#9ca3af"
                                />
                            </Pressable>
                        )}
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
                        {editData?.id === "radius" && (
                            <RadiusEditor
                                data={editData.data}
                                editingKey={editingKey!}
                                onPickLocationOnMap={onPickLocationOnMap}
                            />
                        )}
                        {editData?.id === "thermometer" && (
                            <ThermometerEditor
                                data={editData.data}
                                editingKey={editingKey!}
                                onPickLocationOnMap={onPickLocationOnMap}
                            />
                        )}
                        {editData?.id === "tentacles" && (
                            <TentaclesEditor
                                data={editData.data}
                                editingKey={editingKey!}
                                isNew={isAddMode}
                                onPickLocationOnMap={onPickLocationOnMap}
                            />
                        )}
                        {editData?.id === "matching" && (
                            <MatchingEditor
                                data={editData.data}
                                editingKey={editingKey!}
                                onPickLocationOnMap={onPickLocationOnMap}
                            />
                        )}
                        {editData?.id === "measuring" && (
                            <MeasuringEditor
                                data={editData.data}
                                editingKey={editingKey!}
                                onPickLocationOnMap={onPickLocationOnMap}
                            />
                        )}
                    </BottomSheetScrollView>

                    {isAddMode && (
                        <View
                            className="p-4 border-t border-gray-100"
                            style={{ paddingBottom: insets.bottom + 16 }}
                        >
                            <Pressable
                                onPress={() => {
                                    const draft = draftQuestion.get();
                                    if (draft) {
                                        const isNew = isAddMode;
                                        addQuestion(draft);
                                        posthog?.capture(
                                            isNew ? "question_saved_new" : "question_saved_edit",
                                            { question_type: draft.id },
                                        );
                                    }
                                    draftQuestion.set(null);
                                    goBackToList();
                                }}
                                className="flex-row items-center justify-center h-12 rounded-xl gap-2 active:opacity-80"
                                style={{
                                    backgroundColor: editData
                                        ? colorForType(editData.id)
                                        : colors.PRIMARY,
                                }}
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
});

// These must remain StyleSheet — passed to BottomSheet via backgroundStyle/handleIndicatorStyle props
// (third-party component props, not core RN style/className)
const styles = StyleSheet.create({
    sheetBackground: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    handleIndicator: {
        backgroundColor: "#d1d5db",
        width: 36,
    },
});
