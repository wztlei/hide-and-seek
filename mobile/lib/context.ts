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
