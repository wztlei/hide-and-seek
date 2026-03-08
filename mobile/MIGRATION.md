# Mobile Migration Roadmap

Living document: update checkboxes after each session. Agents read this to know what exists — keep it current.

---

## Architecture Decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Map library | `@maplibre/maplibre-react-native` | OSM tile-compatible (no Google Maps key), native GeoJSON layer support, matches web tile source |
| Navigation | Expo Router (file-based) | Better Expo integration, simpler than React Navigation for this app structure |
| Styling | NativeWind v4 | Same Tailwind class names as web — reduces mental translation cost during migration |
| State storage | nanostores + custom AsyncStorage adapter | Keep same atoms, swap only the persistence backend |
| HTTP cache | AsyncStorage-based | Replace browser Cache API; same 3-bucket strategy (per-question, per-zone, permanent) |
| Notifications | `react-native-toast-message` | Drop-in conceptual replacement for react-toastify |
| UI components | Custom NativeWind components | No direct shadcn/Radix equivalent for RN; build minimal set as needed per phase |

---

## Shared Code Portability

| File | Status | Action |
|------|--------|--------|
| `src/maps/schema.ts` | Portable | Use directly |
| `src/maps/index.ts` | Portable | Use directly |
| `src/maps/api/types.ts` | Minor fix | Remove Leaflet `LatLngTuple` import |
| `src/maps/api/constants.ts` | Portable | Use directly |
| `src/maps/api/geocode.ts` | Portable | Use directly |
| `src/maps/api/geo.ts` | Portable | Use directly |
| `src/maps/api/importers.ts` | Portable | Use directly |
| `src/maps/api/overpass.ts` | Minor refactor | Pass atom values as params instead of calling `.get()` |
| `src/maps/api/cache.ts` | Rewrite | Replace browser Cache API with AsyncStorage version in `mobile/lib/cache.ts` |
| `src/maps/geo-utils/operators.ts` | Test needed | ArcGIS modules may not bundle in RN |
| `src/maps/geo-utils/voronoi.ts` | Portable | D3 + turf, no DOM |
| `src/maps/geo-utils/stationManipulations.ts` | Portable | Pure turf.js |
| `src/maps/geo-utils/special.ts` | Portable | Pure JS |
| `src/maps/questions/radius.ts` | Minor refactor | Accept `hiderMode` as param |
| `src/maps/questions/thermometer.ts` | Minor refactor | Accept `hiderMode` as param |
| `src/maps/questions/tentacles.ts` | Minor refactor | Accept `hiderMode` as param |
| `src/maps/questions/matching.ts` | Refactor | Accept all atoms as params; replace toast |
| `src/maps/questions/measuring.ts` | Refactor | Accept all atoms as params; replace toast |
| `src/lib/context.ts` | Adapt | Mirror in `mobile/lib/context.ts` with AsyncStorage backend; omit Leaflet atoms |
| `src/lib/utils.ts` | Rewrite | Platform abstractions for compression, clipboard, share |

---

## Known Issues / Temporary Workarounds

### `react-native-screens` and `react-native-safe-area-context` pinned in `mobile/package.json`; `<SafeAreaProvider>` removed from `app/_layout.tsx`

**Symptom:** `Exception in HostFunction: TypeError: expected dynamic type 'boolean', but had type 'string'` at `<Stack />`.

**Root cause:** `react-native-screens@4.17.0` changed prop types in its Fabric/JSI native spec. Expo Go has its native libraries compiled at a **fixed version** — when a newer JS package is installed, only the JS side upgrades; the native code in Expo Go stays at the bundled version. The JS/native type mismatch causes JSI to throw when the `Stack` host function is called. Confirmed by [react-native-screens issue #3470](https://github.com/software-mansion/react-native-screens/issues/3470).

**Fix applied:**
- Pinned both libraries to Expo Go SDK 54's bundled native versions (from `bundledNativeModules.json`):
  - `react-native-screens: ~4.16.0` (was 4.24.0)
  - `react-native-safe-area-context: ~5.6.0` (was 5.7.0)
- Removed explicit `<SafeAreaProvider>` wrapper from `_layout.tsx` — expo-router already wraps the tree in its own provider; the redundant one was causing issues.

**Re-evaluate when** upgrading to Expo SDK 55+: check `bundledNativeModules.json` in the new SDK and update the pinned versions to match.

### SafeAreaView deprecation warning suppressed (`app/_layout.tsx`)

**Symptom:** `WARN SafeAreaView has been deprecated and will be removed in a future release`.

**Cause:** `expo-router` internally uses `SafeAreaView` from `react-native` in its own `onboard/Tutorial.js` and `ErrorBoundary.js`. Cannot modify `node_modules`.

**Fix applied:** `LogBox.ignoreLogs(['SafeAreaView has been deprecated'])` at top-level in `app/_layout.tsx`.

**Remove when** expo-router updates its internals to use `SafeAreaView` from `react-native-safe-area-context`.

---

## Phase 0 — Infrastructure

**Entry criteria:** Fresh Expo scaffold only; no feature code exists.

**Goal:** Install and wire up all foundational dependencies before any feature work.

### Install commands

```bash
cd mobile

# Navigation
npx expo install expo-router

# Map
npx expo install @maplibre/maplibre-react-native

# Styling
npm install nativewind tailwindcss
npx tailwindcss init

# Storage
npx expo install @react-native-async-storage/async-storage

# Notifications
npm install react-native-toast-message

# GPS
npx expo install expo-location

# Compression (replaces CompressionStream)
npm install fflate

# Clipboard
npx expo install expo-clipboard
```

### Checklist

- [x] `expo-router` installed and `app/` directory structure in place
- [x] `@maplibre/maplibre-react-native` installed (verify native build succeeds)
- [x] NativeWind v4 configured (`tailwind.config.js`, `babel.config.js` updated)
- [x] `@react-native-async-storage/async-storage` installed
- [x] `react-native-toast-message` installed
- [x] `expo-location` installed
- [x] `fflate` installed
- [x] `expo-clipboard` installed

### Files to create

- [x] `mobile/tailwind.config.js` — content glob includes `app/` and `components/`
- [x] `mobile/app/_layout.tsx` — root Expo Router layout with toast provider
- [x] `mobile/app/index.tsx` — main screen shell (empty Stack placeholder)
- [x] `mobile/lib/storage.ts` — `@nanostores/persistent` adapter using AsyncStorage
- [x] `mobile/lib/cache.ts` — AsyncStorage-based cache (replaces `src/maps/api/cache.ts`; keep 3-bucket strategy: per-question, per-zone, permanent)
- [x] `mobile/lib/context.ts` — re-export all nanostores atoms from `src/lib/context.ts`, swap storage adapter; omit `leafletMapContext` and `drawingQuestionKey`
- [x] `mobile/lib/notifications.ts` — thin wrapper over `react-native-toast-message` matching react-toastify call sites (`toast.success`, `toast.error`, `toast.info`)

### Verification

```bash
npx expo start --clear        # no red errors on cold start
npx expo run:ios              # native build succeeds with MapLibre
pnpm dev                      # web app still works
```

---

## Phase 1 — Core Map Screen

**Entry criteria:** Phase 0 complete; all infrastructure files exist and app boots.

**Web source:** `src/components/Map.tsx`, `src/maps/index.ts`

**Goal:** Render a working map with GeoJSON question layers and GPS.

### Features

- [ ] Tile layer (OpenStreetMap or Thunderforest)
- [ ] GeoJSON layers for question results (one layer per `questionKey`)
- [ ] Draggable question markers (long-press + drag)
- [ ] Long-press context menu (add question, copy coordinates)
- [ ] GPS follow-me (`expo-location` `watchPositionAsync`)
- [ ] Auto-zoom to result bounds

### Shared code used directly

- `src/maps/index.ts` — `applyQuestionsToMapGeoData()`
- `src/maps/schema.ts` — question types
- `src/lib/context.ts` atoms via `mobile/lib/context.ts`

### Files to create

- [ ] `mobile/components/MapView.tsx`
- [ ] `mobile/components/DraggableMarker.tsx`
- [ ] `mobile/components/MapContextMenu.tsx`

### Verification

```bash
npx expo start --clear
# - Map tiles load
# - Long-press shows context menu
# - GPS button centers map on device location
# - Question result GeoJSON renders after adding a test question
pnpm dev                      # web app still works
```

---

## Phase 2 — Question System

**Entry criteria:** Phase 1 complete; map renders with GeoJSON layers.

**Web source:** `src/components/questions/`, `src/components/AddQuestion.tsx`, `src/components/Sidebar.tsx`, `src/maps/questions/`

**Goal:** All 5 question types fully functional with add/edit/delete UI.

### Features

- [ ] Bottom sheet / slide-up drawer listing all questions
- [ ] Add Question dialog (same 5 types + paste JSON)
- [ ] Radius card
- [ ] Thermometer card
- [ ] Tentacles card
- [ ] Matching card
- [ ] Measuring card
- [ ] Card actions: collapse, lock/unlock drag, share JSON, delete
- [ ] `LatLngPicker` input (text inputs + tap-on-map mode)

### Shared code used directly (no changes needed)

- `src/maps/questions/radius.ts`
- `src/maps/questions/thermometer.ts`
- `src/maps/questions/tentacles.ts`
- `src/maps/questions/matching.ts` — refactor: accept all atoms as params; replace toast with `mobile/lib/notifications.ts`
- `src/maps/questions/measuring.ts` — refactor: accept all atoms as params; replace toast
- `src/maps/api/overpass.ts` — minor refactor: pass atom values as params
- `src/maps/api/geocode.ts`, `geo.ts`, `importers.ts`

### Files to create

- [ ] `mobile/components/QuestionSheet.tsx`
- [ ] `mobile/components/cards/base.tsx`
- [ ] `mobile/components/cards/radius.tsx`
- [ ] `mobile/components/cards/thermometer.tsx`
- [ ] `mobile/components/cards/tentacles.tsx`
- [ ] `mobile/components/cards/matching.tsx`
- [ ] `mobile/components/cards/measuring.tsx`
- [ ] `mobile/components/AddQuestionDialog.tsx`
- [ ] `mobile/components/LatLngPicker.tsx`

### Verification

```bash
npx expo start --clear
# - Can add one of each question type
# - Results render on map as GeoJSON
# - Delete removes question and clears layer
# - Tap-on-map mode for LatLngPicker works
pnpm dev                      # web app still works
```

---

## Phase 3 — Place Picker

**Entry criteria:** Phase 2 complete; question system fully functional.

**Web source:** `src/components/PlacePicker.tsx`, `src/maps/api/geocode.ts`

**Goal:** Region search and multi-region management.

### Features

- [ ] Search bar with 500ms debounce → Photon API
- [ ] Current location(s) display
- [ ] Add / subtract / remove regions
- [ ] Clear cache button

### Shared code used directly

- `src/maps/api/geocode.ts`
- `mobile/lib/cache.ts` (clear cache action)
- `mobile/lib/context.ts` atoms

### Files to create

- [ ] `mobile/components/PlacePicker.tsx`

### Verification

```bash
npx expo start --clear
# - Search returns Photon results
# - Adding a region restricts the map zone
# - Clear cache empties AsyncStorage cache buckets
pnpm dev                      # web app still works
```

---

## Phase 4 — Settings & Sharing

**Entry criteria:** Phase 3 complete; place picker works.

**Web source:** `src/components/OptionDrawers.tsx`, `src/lib/utils.ts`

**Goal:** Settings panel, share/import state, hider mode.

### Features

- [ ] Settings sheet: units, animation, train lines, hider mode, planning mode, autosave, autozoom, GPS, API keys
- [ ] Share: compress state → URL (or Pastebin), use `Share` from `react-native`
- [ ] Import: paste JSON/URL to restore state
- [ ] Hider mode: location editor

### Platform adaptations

| Web | Mobile |
|-----|--------|
| `navigator.share()` | `Share.share()` from `react-native` |
| `navigator.clipboard` | `Clipboard` from `expo-clipboard` |
| `CompressionStream` | `fflate` (pure-JS, already installed in Phase 0) |

### Files to create

- [ ] `mobile/components/SettingsSheet.tsx`
- [ ] Update `mobile/lib/utils.ts` with platform abstractions

### Verification

```bash
npx expo start --clear
# - All toggles persist across app restart (AsyncStorage)
# - Share produces a URL/JSON that can be pasted back to import
# - Hider mode toggle changes map behavior
pnpm dev                      # web app still works
```

---

## Phase 5 — Zone Sidebar

**Entry criteria:** Phase 4 complete; settings and sharing work.

**Web source:** `src/components/ZoneSidebar.tsx`, `src/maps/geo-utils/stationManipulations.ts`

**Goal:** Hiding zones and train station management.

### Features

- [ ] Toggle hiding zones display
- [ ] OSM tag selector for zone types
- [ ] Hiding radius input
- [ ] Station list with search
- [ ] Enable/disable per station
- [ ] Custom stations import (CSV/JSON)
- [ ] Merge duplicates toggle

### Shared code used directly

- `src/maps/geo-utils/stationManipulations.ts`
- `src/maps/geo-utils/special.ts`

### Files to create

- [ ] `mobile/components/ZoneSheet.tsx`
- [ ] `mobile/components/StationList.tsx`

### Verification

```bash
npx expo start --clear
# - Zone layer toggles on/off
# - Station search filters list
# - Disabling a station removes it from zone layer
pnpm dev                      # web app still works
```

---

## Phase 6 — Advanced Features

**Entry criteria:** Phases 0–5 complete; app is feature-complete at parity with web.

**Goal:** Nice-to-have features; implement in any order.

### Features

- [ ] Custom polygon drawing (replace Leaflet-Draw — use MapLibre gesture + turf)
- [ ] Planning mode polygons
- [ ] Tutorial / onboarding walkthrough
- [ ] Custom presets (save/load/share question sets)
- [ ] Pastebin import/export

### Notes

- Polygon drawing has no drop-in RN equivalent to Leaflet-Draw; build gesture-based point capture → turf polygon
- Tutorial: consider `react-native-spotlight-tour` or a simple modal sequence
- Presets: serialize atom state to AsyncStorage named slots

---

## Claude Workflow Guide

### Session structure

One phase per session maximum. Always orient a new session by reading this file first.

### Plan → Build → Test → Commit loop

```
/plan  →  describe the phase
       →  point agents to specific web source files (not whole directories)
       →  Explore agent reads web source + existing mobile components
       →  Plan agent designs the port
       →  Review and approve before writing any code

(build)  →  implement one feature area per session
         →  write unit/integration tests alongside each feature (see Testing section)
         →  Explore agents check existing mobile patterns before writing new files
         →  Build only what the plan specifies; no scope creep

(verify) →  npx expo start --clear
         →  manual test on device/simulator per the phase's verification checklist
         →  run tests: cd mobile && npx jest --watchAll=false
         →  check web app still works: pnpm dev + pnpm test (from root)
         →  report results to Claude before proceeding

(commit) →  after user confirms manual verification passes:
         →  git add mobile/ (stage only mobile changes)
         →  git commit -m "feat(mobile): <phase description>"
         →  git push
         →  update MIGRATION.md + MIGRATION_PROGRESS.md checkboxes
```

### Testing strategy

Each phase ships tests alongside the feature code:

```
mobile/
  __tests__/
    lib/
      storage.test.ts       # Phase 0 — AsyncStorage adapter round-trip
      cache.test.ts         # Phase 0 — 3-bucket cache logic, dedup in-flight
      context.test.ts       # Phase 0 — atom defaults + persistence
      notifications.test.ts # Phase 0 — toast wrapper call signatures
    components/
      MapView.test.tsx      # Phase 1 — tile layer renders, GPS button
      QuestionSheet.test.tsx # Phase 2 — add/delete question, sheet toggle
      cards/
        radius.test.tsx     # Phase 2
        thermometer.test.tsx
        tentacles.test.tsx
        matching.test.tsx
        measuring.test.tsx
      PlacePicker.test.tsx  # Phase 3
      SettingsSheet.test.tsx # Phase 4
      ZoneSheet.test.tsx    # Phase 5
```

**Test setup** (`mobile/jest.config.js` + `mobile/jest.setup.ts`):
- `jest-expo` preset handles RN transform
- Mock `@react-native-async-storage/async-storage` with `@react-native-async-storage/async-storage/jest/async-storage-mock`
- Mock `@maplibre/maplibre-react-native` (no native renderer in CI)
- Mock `expo-location`, `expo-clipboard`

**What to test per layer:**
- `lib/` — pure logic, mock AsyncStorage; full unit tests
- `components/` — React Native Testing Library (`@testing-library/react-native`); test user interactions, not implementation details
- Shared `src/maps/` logic — already tested via root vitest; don't duplicate

**Run tests:**
```bash
cd mobile
npx jest --watchAll=false          # all tests
npx jest --testPathPattern=cache   # single file
```

### Parallel subagent patterns

```
# Build all 5 question cards in one message (independent components):
Agent 1: read src/components/questions/radius.tsx  → write mobile/components/cards/radius.tsx
Agent 2: read src/components/questions/thermometer.tsx → write mobile/components/cards/thermometer.tsx
Agent 3: read src/components/questions/tentacles.tsx → write mobile/components/cards/tentacles.tsx
Agent 4: read src/components/questions/matching.tsx → write mobile/components/cards/matching.tsx
Agent 5: read src/components/questions/measuring.tsx → write mobile/components/cards/measuring.tsx

# Research split:
Explore Agent A: read web source file for the component being ported
Explore Agent B: read existing mobile components for naming/style consistency
```

Use `isolation: "worktree"` for risky shared-code refactors (e.g., modifying `src/maps/questions/` files) to avoid polluting the main working tree.

### Context efficiency rules

- Point agents to specific files, not whole directories
- Keep checkboxes current — agents read this file to know what exists and skip re-exploration of done work
- Do NOT re-explore already-ported files; mark them done and move on
- If a session ends mid-phase, note the stopping point in a comment below the relevant phase heading

### Quick reference: key file locations

```
Web app source:
  src/components/Map.tsx               # map component
  src/components/Sidebar.tsx           # question sidebar
  src/components/PlacePicker.tsx       # region picker
  src/components/OptionDrawers.tsx     # settings + share
  src/components/ZoneSidebar.tsx       # zone management
  src/components/questions/            # question card components
  src/maps/                            # all portable business logic
  src/lib/context.ts                   # nanostores atoms

Mobile targets:
  mobile/app/                          # Expo Router screens
  mobile/components/                   # React Native components
  mobile/lib/                          # platform abstraction layer
```
