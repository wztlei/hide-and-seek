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
 *  - Exposes zoomToUserLocation for the locate FAB.
 */
export function useUserLocation(cameraRef: RefObject<CameraRef | null>) {
    const [userCoord, setUserCoord] = useState<[number, number] | null>(null);
    const [hasLocationPermission, setHasLocationPermission] = useState(false);

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
                centerCoordinate: [
                    pos.coords.longitude,
                    pos.coords.latitude,
                ],
                zoomLevel: 13,
                animationMode: "flyTo",
                animationDuration: 800,
            });
        })();
        return () => {
            cancelled = true;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const zoomToUserLocation = useCallback(async () => {
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
    }, [cameraRef]);

    // Stable callback to pass to MapLibre's <UserLocation onUpdate={...} />.
    const handleLocationUpdate = useCallback(
        (loc: { coords: { longitude: number; latitude: number } }) => {
            setUserCoord([loc.coords.longitude, loc.coords.latitude]);
        },
        [],
    );

    return { userCoord, hasLocationPermission, zoomToUserLocation, handleLocationUpdate };
}
