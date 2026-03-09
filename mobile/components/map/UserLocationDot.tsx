import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { colors } from "../../lib/colors";

const DOT_SIZE = 16;
const RING_SIZE = DOT_SIZE;

/**
 * Animated blue GPS dot rendered inside a MapLibre MarkerView.
 * A pulsing ring fades out from 1× to 2.8× scale over 1.4 s to indicate live
 * tracking. The inner dot sits on top of a white border circle.
 */
export function UserLocationDot() {
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 1400,
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ]),
        ).start();
    }, [pulse]);

    const ringScale = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 2.8],
    });
    const ringOpacity = pulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.5, 0.15, 0],
    });

    return (
        <View style={styles.dotContainer}>
            <Animated.View
                style={[
                    styles.ring,
                    { transform: [{ scale: ringScale }], opacity: ringOpacity },
                ]}
            />
            <View style={styles.dotBorder}>
                <View style={styles.dot} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    dotContainer: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        alignItems: "center",
        justifyContent: "center",
    },
    ring: {
        position: "absolute",
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        backgroundColor: colors.PRIMARY,
    },
    dotBorder: {
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 3,
    },
    dot: {
        width: DOT_SIZE - 4,
        height: DOT_SIZE - 4,
        borderRadius: (DOT_SIZE - 4) / 2,
        backgroundColor: colors.PRIMARY,
    },
});
