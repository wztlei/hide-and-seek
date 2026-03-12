import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

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
        <View className="w-4 h-4 items-center justify-center">
            {/* Pulsing ring — must use style for Animated transform/opacity */}
            <Animated.View
                style={[
                    {
                        position: "absolute",
                        width: RING_SIZE,
                        height: RING_SIZE,
                        borderRadius: RING_SIZE / 2,
                        backgroundColor: colors.PRIMARY,
                    },
                    { transform: [{ scale: ringScale }], opacity: ringOpacity },
                ]}
            />
            {/* White border circle — shadow props have no NW equivalent */}
            <View
                className="w-4 h-4 rounded-full bg-white items-center justify-center"
                style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.2,
                    shadowRadius: 2,
                    elevation: 3,
                }}
            >
                <View
                    className="rounded-full"
                    style={{
                        width: DOT_SIZE - 4,
                        height: DOT_SIZE - 4,
                        borderRadius: (DOT_SIZE - 4) / 2,
                        backgroundColor: colors.PRIMARY,
                    }}
                />
            </View>
        </View>
    );
}
