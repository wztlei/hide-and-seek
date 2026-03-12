import "../global.css";

import * as Sentry from "@sentry/react-native";
import { Stack } from "expo-router";
import { PostHogProvider } from "posthog-react-native";
import { useEffect, useState } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";

import { toastConfig } from "../components/ToastConfig";
import { storageReady } from "../lib/storage";

Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    enabled: !__DEV__,
});

// Suppress deprecation warning emitted by expo-router's own internal code
LogBox.ignoreLogs(["SafeAreaView has been deprecated"]);


function RootLayout() {
    const [ready, setReady] = useState(false);

    // Block rendering until AsyncStorage is fully loaded into the in-memory
    // mirror so that nanostores atoms read persisted values on first mount.
    useEffect(() => {
        storageReady.then(() => setReady(true));
    }, []);

    // expo-router's ExpoRoot already wraps everything in SafeAreaProvider.
    // Adding our own causes NativeWind's css-interop Babel shim to apply to it
    // (user code is transformed; node_modules is not), which injects CSS variable
    // strings as props onto react-native-screens' Fabric Stack → JSI TypeError.
    return (
        <PostHogProvider
            apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "placeholder"}
            options={{
                host: "https://us.i.posthog.com",
                disabled: !process.env.EXPO_PUBLIC_POSTHOG_KEY,
            }}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                {ready && (
                    <>
                        <Stack />
                        <Toast config={toastConfig} position="top" topOffset={60} />
                    </>
                )}
            </GestureHandlerRootView>
        </PostHogProvider>
    );
}

export default Sentry.wrap(RootLayout);
