import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import Constants from "expo-constants";
import { useCallback, useRef, useEffect } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { thunderforestApiKey } from "../lib/context";
import { colors } from "../lib/colors";

interface Props {
    visible: boolean;
    onClose: () => void;
}

const APP_VERSION =
    Constants.expoConfig?.version ?? Constants.manifest?.version ?? "1.0.0";

const GITHUB_ISSUES_URL = "https://github.com/wztlei/hide-and-seek/issues";
const FEEDBACK_FORM_URL = "https://forms.gle/bGJ1FWvdKPHFnjp56";

function LinkRow({
    icon,
    label,
    sublabel,
    url,
}: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
    sublabel: string;
    url: string;
}) {
    return (
        <Pressable
            onPress={() => Linking.openURL(url)}
            className="flex-row items-center py-3.5 px-1 gap-3 active:opacity-60"
            style={styles.linkRowBorder}
        >
            <View className="w-9 h-9 rounded-lg bg-indigo-50 items-center justify-center">
                <Ionicons name={icon} size={22} color={colors.PRIMARY} />
            </View>
            <View className="flex-1">
                <Text className="text-base font-medium text-gray-900">{label}</Text>
                <Text className="text-sm text-gray-500 mt-px">{sublabel}</Text>
            </View>
            <Ionicons name="open-outline" size={16} color="#9ca3af" />
        </Pressable>
    );
}

export function SettingsSheet({ visible, onClose }: Props) {
    const sheetRef = useRef<BottomSheet>(null);
    const insets = useSafeAreaInsets();
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const isProgrammaticCloseRef = useRef(false);

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

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={["60%"]}
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
            {/* BottomSheetScrollView is a third-party component — use contentContainerStyle for the inner container */}
            <BottomSheetScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 16 },
                ]}
            >
                {/* Header */}
                <View className="flex-row items-baseline justify-between mb-3">
                    <Text className="text-xl font-bold text-gray-900">
                        Jet Lag: Hide & Seek
                    </Text>
                    <Text className="text-sm text-gray-500">
                        Version {APP_VERSION}
                    </Text>
                </View>

                {/* Description */}
                <Text className="text-base leading-6 text-gray-700 mb-5">
                    A companion app for Jet Lag: The Game — Hide and Seek.
                    Add questions, track zone eliminations, and narrow down
                    where the hider could be hiding on the map.
                </Text>

                {/* Divider */}
                <View style={styles.divider} className="mb-4" />

                {/* Map tiles */}
                <Text
                    className="text-xs font-semibold text-gray-400 uppercase mb-1"
                    style={styles.sectionTracking}
                >
                    MAP TILES
                </Text>
                <View className="py-3.5 px-1 gap-1" style={styles.linkRowBorder}>
                    <Text className="text-base font-medium text-gray-900">
                        Thunderforest API key
                    </Text>
                    <Text className="text-sm text-gray-500">
                        Optional. Enables transport-style map tiles from Thunderforest.
                    </Text>
                    <TextInput
                        value={$thunderforestApiKey}
                        onChangeText={(text) => thunderforestApiKey.set(text.trim())}
                        placeholder="Paste your API key here"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.apiKeyInput}
                    />
                </View>

                <View style={styles.divider} className="mb-4 mt-1" />

                {/* Links */}
                <Text
                    className="text-xs font-semibold text-gray-400 uppercase mb-1"
                    style={styles.sectionTracking}
                >
                    SUPPORT
                </Text>

                <LinkRow
                    icon="bug-outline"
                    label="Report a bug"
                    sublabel="File an issue on GitHub"
                    url={GITHUB_ISSUES_URL}
                />

                <LinkRow
                    icon="chatbubble-ellipses-outline"
                    label="Share feedback"
                    sublabel="Fill out the feedback form"
                    url={FEEDBACK_FORM_URL}
                />
            </BottomSheetScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    // contentContainerStyle for BottomSheetScrollView (not a core RN component — no className)
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 4,
    },
    // StyleSheet.hairlineWidth has no NativeWind equivalent
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: "#e5e7eb",
    },
    linkRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#f3f4f6",
    },
    // letterSpacing: 0.8 has no direct Tailwind equivalent
    sectionTracking: {
        letterSpacing: 0.8,
    },
    // TextInput does not support className in NativeWind v4 — use style
    apiKeyInput: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: "#111827",
        backgroundColor: "#f9fafb",
        fontFamily: "monospace",
    },
});
