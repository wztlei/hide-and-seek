import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";

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
        <View style={[StyleSheet.absoluteFill, styles.container]}>
            <Animated.View style={{ opacity: pulse }}>
                <Ionicons name="map" size={72} color={colors.PRIMARY} />
            </Animated.View>

            <Text style={styles.title}>Hide and Seek</Text>

            <ActivityIndicator
                size="large"
                color={colors.PRIMARY}
                style={styles.spinner}
            />

            <Text style={styles.subtitle}>
                Fetching zone boundary from OpenStreetMap…
            </Text>
            <Text style={styles.hint}>This may take a few seconds.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    title: {
        fontSize: 26,
        fontWeight: "700",
        color: "#1f2937",
        marginTop: 8,
    },
    spinner: {
        marginVertical: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#6b7280",
        textAlign: "center",
        paddingHorizontal: 40,
    },
    hint: {
        fontSize: 14,
        color: "#9ca3af",
    },
});
