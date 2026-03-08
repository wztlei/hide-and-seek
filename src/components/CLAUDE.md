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
