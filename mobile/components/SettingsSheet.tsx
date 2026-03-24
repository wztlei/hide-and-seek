import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
    type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@nanostores/react";
import Constants from "expo-constants";
import { useCallback, useRef, useEffect } from "react";
import * as Clipboard from "expo-clipboard";
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { thunderforestApiKey, thunderforestEnabled, thunderforestTileUsage } from "../lib/context";
import { colors } from "../lib/colors";

interface Props {
    visible: boolean;
    onClose: () => void;
    hasUpdate?: boolean;
    latestVersion?: string | null;
    storeUrl?: string | null;
}

const APP_VERSION =
    Constants.expoConfig?.version ??
    // @ts-ignore — manifest2 exists in Expo Go (SDK 44+) but is not in the type definitions
    (Constants.manifest2?.extra?.expoClient?.version as string | undefined) ??
    Constants.manifest?.version ??
    "1.0.0";
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

const TILE_LIMIT = 150;
const BUILTIN_KEY = process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY ?? "";

export function SettingsSheet({ visible, onClose, hasUpdate, latestVersion, storeUrl }: Props) {
    const sheetRef = useRef<BottomSheet>(null);
    const insets = useSafeAreaInsets();
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $thunderforestEnabled = useStore(thunderforestEnabled);
    const $tileUsage = useStore(thunderforestTileUsage);

    const usingBuiltinKey = !!BUILTIN_KEY && $thunderforestApiKey === BUILTIN_KEY;
    const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
    const tileUsageCount = $tileUsage.month === month ? $tileUsage.count : 0;
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
            {/* BottomSheetScrollView is a third-party component — use contentContainerStyle for the inner container */}
            <BottomSheetScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 16 },
                ]}
            >
                {/* Update banner */}
                {hasUpdate && storeUrl && (
                    <Pressable
                        onPress={() => Linking.openURL(storeUrl)}
                        style={styles.updateBanner}
                        className="active:opacity-70"
                    >
                        <Ionicons name="sparkles" size={18} color="#92400e" />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.updateBannerTitle}>
                                Update available — v{latestVersion}
                            </Text>
                            <Text style={styles.updateBannerSubtitle}>
                                Tap to open the app store
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#92400e" />
                    </Pressable>
                )}

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
                <View className="flex-row items-center justify-between py-3.5 px-1" style={styles.linkRowBorder}>
                    <View className="flex-1 pr-4">
                        <Text className="text-base font-medium text-gray-900">
                            Transport map tiles
                        </Text>
                        <Text className="text-sm text-gray-500 mt-px">
                            Use the Thunderforest transport-style map.
                        </Text>
                    </View>
                    <Switch
                        value={$thunderforestEnabled}
                        onValueChange={(v) => thunderforestEnabled.set(v)}
                        trackColor={{ false: "#d1d5db", true: colors.PRIMARY }}
                    />
                </View>
                <View className="py-3.5 px-1 gap-1" style={styles.linkRowBorder}>
                    <Text className="text-base font-medium text-gray-900">
                        Your Thunderforest API key
                    </Text>
                    <Text className="text-sm text-gray-500">
                        Limited usage of the transport-layer map is included.
                        Paste your own key to use your personal quota instead.
                    </Text>
                    <View className="flex-row items-center mt-2 gap-2">
                        <View style={styles.apiKeyDisplay} className="flex-1">
                            <Text
                                style={styles.apiKeyText}
                                numberOfLines={1}
                            >
                                {usingBuiltinKey ? "Using shared key" : ($thunderforestApiKey || "No key set")}
                            </Text>
                        </View>
                        <Pressable
                            onPress={async () => {
                                const text = await Clipboard.getStringAsync();
                                if (text) thunderforestApiKey.set(text.trim());
                            }}
                            className="active:opacity-60 px-3 py-2 rounded-lg bg-indigo-50 items-center"
                            style={styles.actionButton}
                        >
                            <Text className="text-base font-medium" style={{ color: colors.PRIMARY }}>Paste</Text>
                        </Pressable>
                        {!usingBuiltinKey && !!$thunderforestApiKey && (
                            <Pressable
                                onPress={() => thunderforestApiKey.set(BUILTIN_KEY)}
                                className="active:opacity-60 px-3 py-2 rounded-lg bg-red-50"
                            >
                                <Text className="text-base font-medium text-red-600">Clear</Text>
                            </Pressable>
                        )}
                    </View>
                </View>
                {usingBuiltinKey && (
                    <View className="py-3 px-1 gap-1.5" style={styles.linkRowBorder}>
                        <View className="flex-row items-center justify-between">
                            <Text className="text-sm text-gray-500">
                                Shared tile budget this month
                            </Text>
                            <Text
                                className="text-sm font-medium"
                                style={{
                                    color:
                                        tileUsageCount >= TILE_LIMIT
                                            ? "#ef4444"
                                            : tileUsageCount >= TILE_LIMIT * 0.8
                                              ? "#f59e0b"
                                              : "#6b7280",
                                }}
                            >
                                {tileUsageCount} / {TILE_LIMIT}
                            </Text>
                        </View>
                        <View style={styles.usageTrack}>
                            <View
                                style={[
                                    styles.usageFill,
                                    {
                                        width: `${Math.min(100, (tileUsageCount / TILE_LIMIT) * 100)}%`,
                                        backgroundColor:
                                            tileUsageCount >= TILE_LIMIT
                                                ? "#ef4444"
                                                : tileUsageCount >= TILE_LIMIT * 0.8
                                                  ? "#f59e0b"
                                                  : colors.PRIMARY,
                                    },
                                ]}
                            />
                        </View>
                        {tileUsageCount >= TILE_LIMIT && (
                            <Text className="text-sm text-red-500">
                                Limit reached — map has switched to a free tile style.
                                Paste your own API key above to restore transport maps.
                            </Text>
                        )}
                    </View>
                )}

                <View style={styles.divider} className="mb-4 mt-1" />

                {/* Cache */}
                <Text
                    className="text-xs font-semibold text-gray-400 uppercase mb-1"
                    style={styles.sectionTracking}
                >
                    CACHE
                </Text>
                <View className="flex-row items-center py-3.5 px-1 gap-3" style={styles.linkRowBorder}>
                    <View className="flex-1">
                        <Text className="text-base font-medium text-gray-900">
                            Clear local cache
                        </Text>
                        <Text className="text-sm text-gray-500 mt-px">
                            Removes cached Overpass query results.
                        </Text>
                    </View>
                    <Pressable
                        onPress={() =>
                            Alert.alert(
                                "Clear cache?",
                                "Cached map data will be deleted. The app will re-fetch from Overpass on next use.",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                        text: "Clear",
                                        style: "destructive",
                                        onPress: () => AsyncStorage.clear(),
                                    },
                                ],
                            )
                        }
                        className="px-3 py-2 rounded-lg bg-red-50 active:opacity-60 items-center"
                        style={styles.actionButton}
                    >
                        <Text className="text-base font-medium text-red-600">
                            Clear
                        </Text>
                    </Pressable>
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
    apiKeyDisplay: {
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "#f9fafb",
    },
    apiKeyText: {
        fontSize: 14,
        color: "#6b7280",
        fontFamily: "monospace",
    },
    actionButton: {
        width: 64,
    },
    usageTrack: {
        height: 4,
        backgroundColor: "#e5e7eb",
        borderRadius: 2,
        overflow: "hidden",
    },
    usageFill: {
        height: 4,
        borderRadius: 2,
    },
    updateBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fef3c7",
        borderWidth: 1,
        borderColor: "#fcd34d",
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    updateBannerTitle: {
        fontSize: 15,
        fontWeight: "600",
        color: "#92400e",
    },
    updateBannerSubtitle: {
        fontSize: 13,
        color: "#b45309",
        marginTop: 1,
    },
});
