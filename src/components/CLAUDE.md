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

---

# PlacePicker.tsx — Component Logic Summary

## Overview

`PlacePicker.tsx` (web: `src/components/PlacePicker.tsx`, mobile: `mobile/components/PlacePicker.tsx`) manages the selected zone list and Photon geocode search. It reads and writes nanostores atoms directly — no callbacks for location selection.

## Trigger / Header (web only)

- Button label: if `polyGeoJSON` is set → "Polygon selected"; else joins `determineName()` of `mapGeoLocation` + all `additionalMapGeoLocations` with `"; "`.
- Opens a Popover containing two sections.

## Section 1 — Selected locations list

Renders `[{ location: $mapGeoLocation, added: true, base: true }, ...$additionalMapGeoLocations]`.

Each row shows:
- **Display name** via `determineName(feature)` — joins `name, state, country` for R-type features.
- **Toggle +/−** (non-base rows only):
  - Green `LucidePlusSquare` when `added: true` (zone unioned). Click → set `location.added = false`, re-set `additionalMapGeoLocations`, clear `mapGeoJSON` + `polyGeoJSON`, trigger `questions` refresh.
  - Red `LucideMinusSquare` when `added: false` (zone subtracted). Click → set `location.added = true`, same side-effects.
  - Disabled (muted, no-op) when `$isLoading` is true.
- **X remove button**:
  - **Base location**: promotes the first `added: true` additional to base (`addedLocations[0].base = true`, filter it out of `additionalMapGeoLocations`, `mapGeoLocation.set(addedLocations[0].location)`). Shows a toast error if no added additional locations exist.
  - **Non-base location**: filters it out of `additionalMapGeoLocations` by `osm_id`.
  - Always clears `mapGeoJSON`, `polyGeoJSON`, triggers `questions` refresh.

## Section 2 — Search

- Debounced (350 ms) Photon search via `geocode(query, "en")` → filters `osm_type === "R"`, deduplicates by `osm_id`.
- **Duplicate-name disambiguation**: count label occurrences; if count > 1, append `(1)`, `(2)` etc.
- **Selecting a result**: `additionalMapGeoLocations.set([...current, { added: true, location: result, base: false }])`. Clears `mapGeoJSON`, `polyGeoJSON`, triggers `questions`.
- **"Clear Questions & Cache"** button: clears `mapGeoJSON`, `polyGeoJSON`, `questions`, calls `clearCache(CacheType.ZONE_CACHE)`.
- **"Reuse Preset Locations"** button (only when `polyGeoJSON` set): clears `polyGeoJSON` + `mapGeoJSON`, triggers `questions`.

## Key helpers

- `determineName(feature: OpenStreetMap)` in `src/maps/api/geo.ts` — joins `name, state, country` for R-type features (has transitive leaflet dependency; inlined in mobile).
- `geocode(query, lang)` in `src/maps/api/geocode.ts` — fetches Photon, converts `[lng,lat]→[lat,lng]`, filters + deduplicates (has transitive leaflet dependency; inlined in mobile).

## Mobile differences

Because `geocode.ts` and `geo.ts` have transitive leaflet dependencies, the mobile PlacePicker inlines equivalent helpers:

- `swapCoords(feature: PhotonFeature): OpenStreetMap` — swaps `[lng,lat]` geometry and `[minLng,minLat,maxLng,maxLat]` extent to the store's `[lat,lng]` / `[maxLat,minLng,minLat,maxLng]` format.
- `determineName(loc: OpenStreetMap): string` — joins `name, state, country` with `", "`.
- `searchLocations(query)` — fetches Photon directly, filters `osm_type === "R"`, deduplicates by `osm_id`.

The mobile component also has no `onSelectLocation` prop — it writes to stores directly, matching the web pattern.

---

## Key Differences vs. Mobile (`MapView.tsx`)

| Concern | Web (`Map.tsx`) | Mobile (`MapView.tsx`) |
|---------|----------------|----------------------|
| Map library | react-leaflet / Leaflet | MapLibre (`@maplibre/maplibre-react-native`) |
| Layer management | Imperative (`map.addLayer` / `map.removeLayer`) | Declarative React state → JSX `<ShapeSource>` |
| Tile config | `<TileLayer>` prop swap | `buildStyleJSON()` returns a MapLibre style JSON string |
| GPS | `navigator.geolocation.watchPosition` | `expo-location` (`Location.watchPositionAsync`) |
| Context menu | `leaflet-contextmenu` plugin | `<MapContextMenu>` component (long-press) |
| Duplicate layer guard | Polling interval | N/A — declarative rendering prevents duplicates |

---

# PolygonDraw.tsx — Component Logic Summary

## Overview

`PolygonDraw.tsx` (`src/components/PolygonDraw.tsx`) is a Leaflet-Draw integration component that enables interactive polygon/marker/polyline drawing on the web map. It is entirely web-only due to its Leaflet-Draw and react-leaflet-draw dependencies.

## What It Renders

- A Leaflet `FeatureGroup` with an `EditControl` (react-leaflet-draw) that surfaces polygon, marker, and polyline drawing tools in the map's bottom-left.
- `TentacleMarker` — clickable markers for `tentacles`-type questions with `locationType: "custom"`. Click opens a dialog to edit the POI name and coordinates inline.
- `MatchingPointMarker` — clickable markers for `matching`-type questions with `type: "custom-points"`. Click opens a lat/lng editor dialog.
- `MeasuringPointMarker` — clickable markers for `measuring`-type questions with `type: "custom-measure"`. Click opens a lat/lng editor dialog.
- Red `<Polygon>` and `<Polyline>` overlays for existing custom-zone/custom-measure geometry.

## Nanostores It Reads / Writes

| Atom | Access | Purpose |
|------|--------|---------|
| `drawingQuestionKey` | read | `-1` = drawing hiding zone; any other value = drawing for that question key |
| `questions` | read/write | Finds the current question; writes updated `places`/`geo` back |
| `mapGeoJSON` | write | Set to drawn FeatureCollection when drawing the hiding zone |
| `polyGeoJSON` | write | Same FeatureCollection written alongside `mapGeoJSON` for zone override |
| `questionModified` | call | Triggers sidebar refresh after per-question drawing changes |
| `autoSave` | read | Conditionally shows a manual Save button in marker dialogs |

## `onChange()` Handler

Called on `EditControl` `onCreated`, `onEdited`, `onDeleted` events:

1. **Hiding zone (`drawingQuestionKey === -1`)**: collects all `FeatureGroup` layers → `layer.toGeoJSON()` → `turf.featureCollection()` → writes to both `mapGeoJSON` and `polyGeoJSON`; clears `questions` and zone cache.
2. **Tentacles custom**: collects point layers → deduplicates by coordinates → writes to `question.data.places`; removes unlabelled markers from the group.
3. **Matching custom-zone**: combines all polygons via `turf.combine()` → writes to `question.data.geo`; removes non-special layers.
4. **Matching custom-points**: collects point layers → deduplicates → writes to `question.data.geo`.
5. **Measuring custom-measure**: collects all layers → deduplicates → writes to `question.data.geo` as a FeatureCollection.

After any per-question write, calls `questionModified()` to refresh the sidebar.

## `swapCoordinates()` Helper

A JSON parse/stringify reviver that flips every `[lat, lng]` pair to `[lng, lat]` (or vice versa). Used when rendering existing custom-zone and custom-measure polygons as Leaflet `<Polygon>` / `<Polyline>` (which expect `[lat, lng]` position arrays), because the store holds standard GeoJSON `[lng, lat]` order.

## Not Portable to React Native

- `leaflet-draw`, `EditControl`, `react-leaflet-draw`, `FeatureGroup`, `Marker`, `Polygon`, `Polyline` — all Leaflet/web-only.
- The coordinate-swap logic, GeoJSON collection, turf.js calls, and nanostore writes are all portable.
- Mobile drawing (if needed) would require a different gesture-based approach (e.g., `@maplibre/maplibre-react-native` `ShapeSource` + touch handlers).
