# Migration Progress

Tracks what has been completed, what is in-progress, and what is remaining.
Update after each verified + committed phase or sub-feature.

---

## Overall Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Infrastructure | 🔄 In Progress | Deps + config + lib files done; awaiting manual verification |
| 1 — Core Map Screen | ⬜ Not Started | |
| 2 — Question System | ⬜ Not Started | |
| 3 — Place Picker | ⬜ Not Started | |
| 4 — Settings & Sharing | ⬜ Not Started | |
| 5 — Zone Sidebar | ⬜ Not Started | |
| 6 — Advanced Features | ⬜ Not Started | |

---

## Phase 0 — Infrastructure

### Dependencies installed
- [x] `expo-router@~6.0.23`
- [x] `@maplibre/maplibre-react-native@^10.4.2`
- [x] `nativewind@^4.2.2`
- [x] `@react-native-async-storage/async-storage@2.2.0`
- [x] `react-native-toast-message@^2.3.3`
- [x] `expo-location@~19.0.8`
- [x] `fflate@^0.8.2`
- [x] `expo-clipboard@~8.0.8`

### Config files
- [x] `mobile/package.json` — update `main` to `expo-router/entry`
- [x] `mobile/app.json` — add `scheme` for deep linking
- [x] `mobile/babel.config.js` — NativeWind preset
- [x] `mobile/tailwind.config.js` — content globs for `app/` + `components/`
- [x] `mobile/metro.config.js` — wrap with `withNativeWind`
- [x] `mobile/nativewind-env.d.ts` — TypeScript types for className prop

### App structure
- [x] `mobile/app/_layout.tsx` — root Expo Router layout with Toast provider
- [x] `mobile/app/index.tsx` — main screen shell

### Lib files
- [x] `mobile/lib/storage.ts` — `setPersistentEngine` with AsyncStorage
- [x] `mobile/lib/cache.ts` — AsyncStorage-based 3-bucket cache
- [x] `mobile/lib/context.ts` — all atoms using AsyncStorage backend; omit Leaflet atoms
- [x] `mobile/lib/notifications.ts` — toast wrapper

### Tests
- [x] `mobile/__tests__/lib/storage.test.ts` — 2 tests pass
- [x] `mobile/__tests__/lib/cache.test.ts` — 7 tests pass
- [x] `mobile/__tests__/lib/notifications.test.ts` — 6 tests pass
- [x] `mobile/jest.config.js` + `mobile/jest.setup.ts`

### Verification
- [ ] `npx expo start --clear` — no red errors on cold start
- [ ] `pnpm dev` — web app still works

---

## Phase 1 — Core Map Screen

### Features
- [ ] Tile layer renders
- [ ] GeoJSON question layers (one per questionKey)
- [ ] Draggable question markers
- [ ] Long-press context menu
- [ ] GPS follow-me
- [ ] Auto-zoom to result bounds

### Files
- [ ] `mobile/components/MapView.tsx`
- [ ] `mobile/components/DraggableMarker.tsx`
- [ ] `mobile/components/MapContextMenu.tsx`

### Tests
- [ ] `mobile/__tests__/components/MapView.test.tsx`

---

## Phase 2 — Question System

### Features
- [ ] Bottom sheet listing questions
- [ ] Add Question dialog (5 types + paste JSON)
- [ ] Radius card
- [ ] Thermometer card
- [ ] Tentacles card
- [ ] Matching card
- [ ] Measuring card
- [ ] Card actions: collapse, lock/unlock drag, share JSON, delete
- [ ] LatLngPicker (text + tap-on-map)

### Files
- [ ] `mobile/components/QuestionSheet.tsx`
- [ ] `mobile/components/cards/base.tsx`
- [ ] `mobile/components/cards/radius.tsx`
- [ ] `mobile/components/cards/thermometer.tsx`
- [ ] `mobile/components/cards/tentacles.tsx`
- [ ] `mobile/components/cards/matching.tsx`
- [ ] `mobile/components/cards/measuring.tsx`
- [ ] `mobile/components/AddQuestionDialog.tsx`
- [ ] `mobile/components/LatLngPicker.tsx`

### Tests
- [ ] `mobile/__tests__/components/QuestionSheet.test.tsx`
- [ ] `mobile/__tests__/components/cards/radius.test.tsx`
- [ ] `mobile/__tests__/components/cards/thermometer.test.tsx`
- [ ] `mobile/__tests__/components/cards/tentacles.test.tsx`
- [ ] `mobile/__tests__/components/cards/matching.test.tsx`
- [ ] `mobile/__tests__/components/cards/measuring.test.tsx`

---

## Phase 3 — Place Picker

### Features
- [ ] Search bar with 500ms debounce → Photon API
- [ ] Current location(s) display
- [ ] Add / subtract / remove regions
- [ ] Clear cache button

### Files
- [ ] `mobile/components/PlacePicker.tsx`

### Tests
- [ ] `mobile/__tests__/components/PlacePicker.test.tsx`

---

## Phase 4 — Settings & Sharing

### Features
- [ ] Settings sheet (all toggles + API keys)
- [ ] Share state → URL/Pastebin
- [ ] Import state from JSON/URL
- [ ] Hider mode location editor

### Files
- [ ] `mobile/components/SettingsSheet.tsx`
- [ ] `mobile/lib/utils.ts`

### Tests
- [ ] `mobile/__tests__/components/SettingsSheet.test.tsx`

---

## Phase 5 — Zone Sidebar

### Features
- [ ] Toggle hiding zones
- [ ] OSM tag selector
- [ ] Hiding radius input
- [ ] Station list with search
- [ ] Enable/disable per station
- [ ] Custom stations import
- [ ] Merge duplicates toggle

### Files
- [ ] `mobile/components/ZoneSheet.tsx`
- [ ] `mobile/components/StationList.tsx`

### Tests
- [ ] `mobile/__tests__/components/ZoneSheet.test.tsx`

---

## Phase 6 — Advanced Features

### Features
- [ ] Custom polygon drawing
- [ ] Planning mode polygons
- [ ] Tutorial / onboarding
- [ ] Custom presets
- [ ] Pastebin import/export

---

## Commit Log

| Date | Commit | Phase | Description |
|------|--------|-------|-------------|
| — | — | — | No commits yet |
