import type { CameraRef } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Manages device location for the map:
 *  - Requests foreground location permission on mount.
 *  - Flies the camera to the user's position on first grant (zoom 13).
 *  - Tracks live GPS updates via the MapLibre UserLocation component's
 *    onUpdate callback (handleLocationUpdate).
 *  - Exposes onLocatePress for the locate FAB, which alternates between
 *    flying to the user's GPS position and fitting the game zone bounds.
 */
export function useUserLocation(
    cameraRef: RefObject<CameraRef | null>,
    zoneBbox: [number, number, number, number] | null,
) {
    const [userCoord, setUserCoord] = useState<[number, number] | null>(null);
    const [hasLocationPermission, setHasLocationPermission] = useState(false);
    // "user" = next press flies to GPS; "zone" = next press fits zone bounds.
    const [locateMode, setLocateMode] = useState<"user" | "zone">("user");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { status } =
                await Location.requestForegroundPermissionsAsync();
            if (status !== "granted" || cancelled) return;
            setHasLocationPermission(true);

            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            if (cancelled) return;
            cameraRef.current?.setCamera({
                centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
                zoomLevel: 13,
                animationMode: "flyTo",
                animationDuration: 800,
            });
        })();
        return () => {
            cancelled = true;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const onLocatePress = useCallback(async () => {
        if (locateMode === "zone" && zoneBbox) {
            const [minLng, minLat, maxLng, maxLat] = zoneBbox;
            cameraRef.current?.fitBounds(
                [maxLng, maxLat],
                [minLng, minLat],
                40,
                800,
            );
            setLocateMode("user");
        } else {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;
            const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            cameraRef.current?.setCamera({
                centerCoordinate: [pos.coords.longitude, pos.coords.latitude],
                zoomLevel: 13,
                animationMode: "flyTo",
                animationDuration: 800,
            });
            setLocateMode("zone");
        }
    }, [cameraRef, locateMode, zoneBbox]);

    // Stable callback to pass to MapLibre's <UserLocation onUpdate={...} />.
    const handleLocationUpdate = useCallback(
        (loc: { coords: { longitude: number; latitude: number } }) => {
            setUserCoord([loc.coords.longitude, loc.coords.latitude]);
        },
        [],
    );

    return {
        userCoord,
        hasLocationPermission,
        locateMode,
        onLocatePress,
        handleLocationUpdate,
    };
}
