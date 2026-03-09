import { Stack } from "expo-router";
import { View } from "react-native";

import { AppMapView } from "../components/MapView";

export default function HomeScreen() {
    return (
        <View className="flex-1">
            <Stack.Screen options={{ headerShown: false }} />
            <AppMapView />
        </View>
    );
}
