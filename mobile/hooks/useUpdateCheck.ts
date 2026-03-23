import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

interface UpdateInfo {
    hasUpdate: boolean;
    latestVersion: string | null;
    storeUrl: string | null;
}

const VERSION_URL =
    "https://raw.githubusercontent.com/wztlei/hide-and-seek/refs/heads/master/public/version.json";

export function useUpdateCheck(): UpdateInfo {
    const [info, setInfo] = useState<UpdateInfo>({
        hasUpdate: false,
        latestVersion: null,
        storeUrl: null,
    });

    useEffect(() => {
        fetch(VERSION_URL)
            .then((r) => r.json())
            .then((data) => {
                const current =
                    Constants.expoConfig?.version ??
                    // @ts-ignore — manifest2 exists in Expo Go (SDK 44+) but is not in the type definitions
                    (Constants.manifest2?.extra?.expoClient?.version as string | undefined) ??
                    Constants.manifest?.version ??
                    "0.0.0";
                const hasUpdate = data.version !== current;
                const storeUrl =
                    Platform.OS === "ios" ? data.ios_url : data.android_url;
                setInfo({ hasUpdate, latestVersion: data.version, storeUrl });
            })
            .catch(() => {}); // silent — never crash on version check
    }, []);

    return info;
}
