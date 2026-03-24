/**
 * Re-exports all nanostores atoms from src/lib/context.ts.
 * Importing this file instead of src/lib/context.ts ensures the AsyncStorage
 * engine is configured before any persistentAtom is initialized.
 *
 * Omitted atoms (Leaflet / web-only):
 *   - leafletMapContext
 *   - drawingQuestionKey
 */

// Configure AsyncStorage engine FIRST — must precede any atom import
import "./storage";

import { thunderforestApiKey } from "../../src/lib/context";

// Seed the Thunderforest API key from the build-time env var if the user hasn't
// set one via the settings UI. AsyncStorage persistence is async-only so the env
// var is the reliable cold-start default.
if (!thunderforestApiKey.get()) {
    const envKey = process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY;
    if (envKey) thunderforestApiKey.set(envKey);
}

export {
    additionalMapGeoLocations,
    addQuestion,
    alwaysUsePastebin,
    animateMapMovements,
    autoSave,
    autoZoom,
    customInitPreference,
    type CustomPreset,
    customPresets,
    customStations,
    defaultUnit,
    deleteCustomPreset,
    disabledStations,
    displayHidingZones,
    displayHidingZonesOptions,
    followMe,
    hiderMode,
    hidingRadius,
    hidingRadiusUnits,
    hidingZone,
    highlightTrainLines,
    includeDefaultStations,
    isLoading,
    mapGeoJSON,
    mapGeoLocation,
    mergeDuplicates,
    showHidingZoneCircles,
    pastebinApiKey,
    planningModeEnabled,
    polyGeoJSON,
    questionFinishedMapData,
    questionModified,
    questions,
    save,
    saveCustomPreset,
    showTutorial,
    thunderforestApiKey,
    thunderforestEnabled,
    thunderforestTileUsage,
    trainStations,
    triggerLocalRefresh,
    tutorialStep,
    uniformQuestionColor,
    updateCustomPreset,
    useCustomStations,
} from "../../src/lib/context";
