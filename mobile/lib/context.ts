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
import './storage';

import { thunderforestApiKey } from '../../src/lib/context';

// Seed the Thunderforest API key from the build-time env var if the user hasn't
// set one via the settings UI. AsyncStorage persistence is async-only so the env
// var is the reliable cold-start default.
if (!thunderforestApiKey.get()) {
  const envKey = process.env.EXPO_PUBLIC_THUNDERFOREST_API_KEY;
  if (envKey) thunderforestApiKey.set(envKey);
}

export {
  mapGeoLocation,
  additionalMapGeoLocations,
  mapGeoJSON,
  polyGeoJSON,
  questions,
  addQuestion,
  questionModified,
  defaultUnit,
  highlightTrainLines,
  hiderMode,
  triggerLocalRefresh,
  displayHidingZones,
  displayHidingZonesOptions,
  questionFinishedMapData,
  trainStations,
  useCustomStations,
  customStations,
  mergeDuplicates,
  includeDefaultStations,
  animateMapMovements,
  hidingRadius,
  hidingRadiusUnits,
  disabledStations,
  autoSave,
  save,
  type CustomPreset,
  customPresets,
  saveCustomPreset,
  updateCustomPreset,
  deleteCustomPreset,
  hidingZone,
  planningModeEnabled,
  autoZoom,
  isLoading,
  thunderforestApiKey,
  followMe,
  pastebinApiKey,
  alwaysUsePastebin,
  showTutorial,
  tutorialStep,
  customInitPreference,
} from '../../src/lib/context';
