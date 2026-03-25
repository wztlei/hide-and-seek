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

/** Returns true if `a` is strictly greater than `b` (semver, numeric segments). */
function versionGt(a: string, b: string): boolean {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na !== nb) return na > nb;
    }
    return false;
}

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
                const hasUpdate = versionGt(data.version, current);
                const storeUrl =
                    Platform.OS === "ios" ? data.ios_url : data.android_url;
                setInfo({ hasUpdate, latestVersion: data.version, storeUrl });
            })
            .catch(() => {}); // silent — never crash on version check
    }, []);

    return info;
}
