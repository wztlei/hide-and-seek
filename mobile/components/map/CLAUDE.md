# MapView Architecture

## Map Shading Design Rule

**Only the area directly eliminated by a question is shaded, using that question's colour. Uneliminated areas are left clear.**

- The base `eliminationMask` fills the area *outside the game zone* with indigo — this is always present.
- A permanent `zoneBoundary` `LineLayer` traces the game zone edge regardless of questions.
- Each question type contributes its own fill geometry (clipped to the game zone), computed in `useEliminationMask`:
  - **Radius `within=true`** → shade the ring *outside* the circle (the eliminated outer area) in `colors.RADIUS`
  - **Radius `within=false`** → shade the circle itself (the eliminated inner area) in `colors.RADIUS`
  - **Thermometer** → shade the valid half (the side containing the "closer" point) in `colors.THERMOMETER` as a positive indicator
- Never shade the valid zone with a question's colour.

---


`mobile/components/MapView.tsx` (`AppMapView`) is the root map screen. It is intentionally thin: it holds state, wires hooks together, and delegates rendering to focused sub-components.

## File Map

```
mobile/
  components/
    MapView.tsx               ← coordinator (state + wiring only)
    map/
      MapLayers.tsx           ← all ShapeSource/Layer/MarkerView children of MLMapView
      PickLocationBanner.tsx  ← floating overlay during map-pick mode
      MapActionButtons.tsx    ← three right-side FABs
      UserLocationDot.tsx     ← animated pulsing GPS dot
  hooks/
    useEliminationMask.ts     ← computes the blue zone-elimination overlay
    useZoneBoundary.ts        ← fetches & caches OSM zone boundary
    useUserLocation.ts        ← GPS permission, initial camera flyTo, live coord
```

---

## State owned by AppMapView

| State | Type | Purpose |
|---|---|---|
| `editingQuestionKey` | `number \| null` | Which question the edit panel (Screen 3) is showing |
| `questionsVisible` | `boolean` | Whether the QuestionsPanel bottom sheet is open |
| `zoneModalVisible` | `boolean` | Whether the PlacePicker modal is open |
| `pickingLocationForKey` | `number \| null` | Non-null while pick-mode is active; identifies the question being edited |
| `pickingLocationField` | `"A" \| "B" \| null` | For thermometer questions, which point is being placed; null for radius |
| `pendingCoord` | `[lng, lat] \| null` | The coord the user tapped; null until a tap registers |

---

## Pick-mode flow

Pick-mode is the two-phase flow where the user taps the map to set a question's location point.

```
QuestionsPanel (Screen 3)
  └── "Select on Map" pressed
        │
        ▼
handlePickLocationOnMap(key, field?)
  • sets pickingLocationForKey, pickingLocationField
  • clears pendingCoord, editingQuestionKey
  • closes QuestionsPanel (setQuestionsVisible false)
  • arms pickReadyRef after 350 ms (waits for BottomSheet close animation)
        │
        ▼  user taps map
MLMapView onPress
  • sets pendingCoord = [lng, lat]
        │
        ▼  PickLocationBanner shows coordinate + "Confirm"
handleConfirmPick()
  • writes pendingCoord → question.data (radius: lat/lng; thermometer: latA/lngA or latB/lngB)
  • calls questionModified() → triggers nanostore reactivity
  • calls finishPicking(key)
        │
        ▼
finishPicking(key)
  • clears pickingLocationForKey, pickingLocationField, pendingCoord
  • sets editingQuestionKey = key
  • reopens QuestionsPanel → initialEditKey restores Screen 3
```

`pickReadyRef` is a plain ref (not state) to avoid a re-render; it prevents the map tap handler from firing while the BottomSheet's close animation is still running.

---

## Hooks

### `useEliminationMask`

Watches `mapGeoJSON` and `questions` from context. On any change it rebuilds the elimination mask:

1. Starts with the full zone polygon(s) from `mapGeoJSON` (unioned if multiple).
2. Iterates questions in order, narrowing the zone:
   - **radius / within:** `turf.intersect(zone, circle)`
   - **radius / outside:** `turf.difference(zone, circle)`
   - **thermometer:** excluded from the elimination mask; instead, a separate `thermometerRegions` array is returned, each containing the valid Voronoi half (the "closer point" side) clipped to the game zone. `MapLayers` renders these as a semi-transparent purple fill.
3. The final elimination mask = world rectangle minus the surviving zone.
4. For each thermometer question: `voronoi` → find cells via `booleanPointInPolygon` → keep `cellB` if `warmer=true`, else `cellA` → `intersect(gameZone, validCell)` → add to `thermometerRegions`.

If any step produces an empty result (no valid positions), the mask is set to the full world rectangle and a "No solutions found" toast is shown.

### `useZoneBoundary`

1. **On mount:** seeds `mapGeoJSON` from MMKV cache so the map renders immediately.
2. **On location change** (keyed on `osm_id` + `additionalMapGeoLocations`): calls `fetchAllZoneBoundaries()`, sets `mapGeoJSON`, and updates the cache. Uses a `requestAnimationFrame` deferral so the "Zone boundary loaded" toast gets a paint cycle before the heavy map re-render.

### `useUserLocation`

1. **On mount:** requests foreground location permission; if granted, flies the camera to the user's position at zoom 13.
2. Returns `handleLocationUpdate` — a stable `useCallback` that updates `userCoord` state. Pass this directly to MapLibre's `<UserLocation onUpdate={...} />`.
3. Returns `zoomToUserLocation` for the locate FAB: re-requests permission (no-op if already granted) and flies the camera.

---

## MapLayers

Renders all data-driven map content as a React Fragment — its children are direct siblings inside `<MLMapView>`, which MapLibre requires.

**Critical ordering rule:** All `ShapeSource`/`LineLayer`/`FillLayer` blocks must come *before* any `MarkerView` blocks (except the user-location dot at the very top). MapLibre RN silently drops any `ShapeSource` that appears after a `MarkerView` in the sibling list.

Layer rendering order (bottom → top):
1. **User location dot** — `MarkerView` + `UserLocationDot`
2. **Thermometer valid-half fills** — `FillLayer` per question (purple, 0.15 opacity), clipped to game zone
3. **Radius eliminated-area fills** — `FillLayer` per question (red, 0.2 opacity), clipped to game zone
4. **Elimination mask** — `FillLayer` (indigo, 0.2 opacity) covering the area outside the game zone
5. **Zone boundary line** — `LineLayer` (indigo, solid) always tracing the raw game zone edge
6. **Radius circle outlines** — `LineLayer` per question (red)
4. **Radius markers** — `MarkerView` with a tappable disc icon per question
5. **Thermometer dividing lines** — the outer ring of Voronoi region 0 rendered as a dashed amber `LineLayer`; the perpendicular bisector is the visible segment within the viewport
6. **Thermometer A/B markers** — amber `A` dot and primary-blue `B` dot per question
7. **Pending coord pin** — orange `MarkerView` shown only during pick-mode phase 2

Tapping any question marker calls `onMarkerPress(key)`, which sets `editingQuestionKey` and opens the QuestionsPanel.

---

## PickLocationBanner

Absolutely positioned overlay at the top of the screen. Two phases:

- **Phase 1** (`pendingCoord === null`): "Tap the map to set location" + cancel ×
- **Phase 2** (`pendingCoord` set): formatted lat/lng + **Confirm** button + × to retap

All logic (reading/writing question data) is in `AppMapView` via the `onConfirm` callback. The banner itself is purely presentational.

---

## MapActionButtons

Three circular FABs stacked on the right side, positioned above the safe-area bottom inset:

| Offset from bottom inset | Icon | Action |
|---|---|---|
| +159 px | chatbox | Open QuestionsPanel |
| +87 px | map / spinner | Open PlacePicker (zone selector) |
| +15 px | locate | Fly camera to GPS position |

The zone button shows an `ActivityIndicator` while `isLoadingZone` is true.

---

## Coordinate convention

**MapLibre everywhere uses `[longitude, latitude]`** (GeoJSON order).

The `mapGeoLocation` nanostore uses `[latitude, longitude]` (non-standard). The swap happens once in `AppMapView` when computing `initialCenter` for the Camera's `defaultSettings`.

All turf.js calls use `[longitude, latitude]` as required by the GeoJSON spec.
