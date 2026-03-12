import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";

import { colors } from "../../lib/colors";

/**
 * Full-screen overlay shown while the zone boundary is being fetched for the
 * first time (i.e. no cached boundary exists yet). Once `mapGeoJSON` is set
 * the parent unmounts this component.
 */
export function MapLoadingOverlay() {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 0.4,
                    duration: 900,
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 900,
                    useNativeDriver: true,
                }),
            ]),
        ).start();
    }, [pulse]);

    return (
        <View className="absolute inset-0 bg-white items-center justify-center gap-3">
            <Animated.View style={{ opacity: pulse }}>
                <Ionicons name="map" size={72} color={colors.PRIMARY} />
            </Animated.View>

            <Text className="text-[26px] font-bold text-gray-800 mt-2">
                Hide and Seek
            </Text>

            <ActivityIndicator
                size="large"
                color={colors.PRIMARY}
                style={{ marginVertical: 8 }}
            />

            <Text className="text-base text-gray-500 text-center px-10">
                Fetching zone boundary from OpenStreetMap…
            </Text>
            <Text className="text-sm text-gray-400">
                This may take a few seconds.
            </Text>
        </View>
    );
}
