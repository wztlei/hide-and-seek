# Map.tsx — Component Logic Summary

## Overview

`Map.tsx` is the core web map component. It renders a Leaflet map via `react-leaflet` and orchestrates all GeoJSON layer management in response to question/state changes.

## Rendering

- `displayMap` is a `useMemo` that builds the `<MapContainer>` only when `map`, `$highlightTrainLines`, or `$thunderforestApiKey` change.
- Tile layer switches between CartoDB Voyager (default) and Thunderforest Transport (when `highlightTrainLines` is on **and** a Thunderforest API key is set).
- Child components rendered inside the map: `DraggableMarkers`, `LeafletFullScreenButton`, `PolygonDraw`, `ScaleControl`, `MapPrint`.

## Right-Click Context Menu (`leaflet-contextmenu`)

Long-press/right-click on the map surfaces a context menu with actions:
- **Add Radius / Thermometer / Tentacles / Matching / Measuring** — calls `addQuestion()` with the clicked coordinates pre-filled.
- **Exclude Country** — shortcut for a `matching` question with `same: false` and `adminLevel: 2`.
- **Copy Coordinates** — writes `lat°N/S, lng°E/W` to the clipboard.

Thermometer pre-places point B 5 miles east of the click.

## `refreshQuestions(focus)` — Layer Pipeline

Called whenever questions or hider mode change. Steps:

1. **Guard** — returns early if no map or already loading; sets `isLoading = true`.
2. **Cache clear** — calls `clearCache()` when there are no questions.
3. **Map boundaries** — resolves `mapGeoData` in priority order: existing `mapGeoJSON` atom → `polyGeoJSON` override → fetch via `determineMapBoundaries()`.
4. **Hider mode** — if active, calls `hiderifyQuestion()` on each question to flip perspective, then triggers a sidebar refresh via `triggerLocalRefresh`.
5. **Remove stale layers** — iterates `map.eachLayer` and removes any layer tagged with `questionKey` (per-question planning layers).
6. **Apply questions** — calls `applyQuestionsToMapGeoData()`, which processes questions sequentially. The callback adds each intermediate GeoJSON as a tagged Leaflet layer (`questionKey`) for planning-mode visualization.
7. **Elimination mask** — wraps the final result in `holedMask()` (dark overlay over excluded areas), removes any previous `eliminationGeoJSON` layer, adds the new one, and writes it to `questionFinishedMapData`.
8. **Auto-zoom** — if `autoZoom` is on and `focus` is true, flies/fits to the bounding box of the mask.

## Effects

| Effect | Trigger | Behavior |
|--------|---------|----------|
| Question refresh | `$questions`, `map`, `$hiderMode` | Calls `refreshQuestions(true)` |
| Duplicate layer guard | 1-second interval | If more than one `eliminationGeoJSON` layer exists, calls `refreshQuestions(false)` |
| Fullscreen CSS class | `fullscreenchange` DOM event | Adds/removes `fullscreen` class on `<main>` |
| Follow-me GPS | `$followMe`, `map` | Watches `navigator.geolocation`, places/moves a blue circle marker; clears watch on cleanup |

## Key Differences vs. Mobile (`MapView.tsx`)

| Concern | Web (`Map.tsx`) | Mobile (`MapView.tsx`) |
|---------|----------------|----------------------|
| Map library | react-leaflet / Leaflet | MapLibre (`@maplibre/maplibre-react-native`) |
| Layer management | Imperative (`map.addLayer` / `map.removeLayer`) | Declarative React state → JSX `<ShapeSource>` |
| Tile config | `<TileLayer>` prop swap | `buildStyleJSON()` returns a MapLibre style JSON string |
| GPS | `navigator.geolocation.watchPosition` | `expo-location` (`Location.watchPositionAsync`) |
| Context menu | `leaflet-contextmenu` plugin | `<MapContextMenu>` component (long-press) |
| Duplicate layer guard | Polling interval | N/A — declarative rendering prevents duplicates |
