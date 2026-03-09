# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This repo is a **pnpm workspace** monorepo with two packages:

| Package    | Path       | Description           |
| ---------- | ---------- | --------------------- |
| Web app    | `.` (root) | Astro + React PWA     |
| Mobile app | `mobile/`  | Expo React Native app |

**Web app commands** (run from root):

```bash
pnpm install       # Install all workspace dependencies
pnpm dev           # Start Astro dev server
pnpm build         # Build for production
pnpm preview       # Preview production build
pnpm lint          # Run ESLint (auto-fix) + Prettier (auto-format)
pnpm test          # Run tests with vitest
```

**Mobile app commands** (run from `mobile/`):

```bash
cd mobile
npx expo start     # Start Expo dev tools (scan QR with Expo Go)
npx expo start --ios      # Open in iOS simulator
npx expo start --android  # Open in Android emulator
```

### Shared Business Logic

Shared code lives in the root `src/maps/` and `src/lib/` directories. Metro is configured in `mobile/metro.config.js` to watch the monorepo root, enabling future cross-package imports. When the shared surface grows, it can be extracted into a `packages/shared/` workspace package.

Files that are already portable to React Native (no changes needed):

- `src/maps/schema.ts` — Zod schemas
- `src/maps/index.ts` — core data pipeline
- `src/maps/api/types.ts`, `constants.ts`, `geo.ts`, `geocode.ts`, `importers.ts`
- `src/maps/geo-utils/` — turf.js geometry utilities
- `src/maps/questions/` — all question-processing logic

Files that need platform abstraction before sharing:

- `src/lib/context.ts` — uses localStorage via `@nanostores/persistent`
- `src/maps/api/cache.ts` — uses browser Cache API
- `src/maps/api/overpass.ts` — reads nanostores atoms directly

## Commands

## Architecture

This is an **Astro + React** PWA (single page at `src/pages/index.astro`) that generates interactive Leaflet maps for the Jet Lag The Game: Hide and Seek game show. The site is deployed to GitHub Pages at `/JetLagHideAndSeek`.

### State Management

All persistent state lives in **nanostores** (`src/lib/context.ts`) using `persistentAtom` (localStorage-backed). Key atoms:

- `mapGeoLocation` — the selected geographic region (OSM feature, default: Japan)
- `additionalMapGeoLocations` — extra regions to add/subtract from the map
- `questions` — the list of active game questions (validated against `questionsSchema`)
- `polyGeoJSON` — optional custom polygon override for the map area
- `hiderMode` — when set to a lat/lng, filters map to show only the hider's possible locations
- `planningModeEnabled` — shows planning polygons instead of filtering

### Data Flow

1. User adds questions via `QuestionSidebar` → stored in `questions` atom
2. `Map.tsx` watches `hidingZone` (a computed nanostore) which combines questions + map region + options
3. `Map.tsx` calls `applyQuestionsToMapGeoData()` (`src/maps/index.ts`) which iterates questions sequentially, intersecting/subtracting GeoJSON for each question
4. Result is rendered as a Leaflet GeoJSON layer

### Question Types & Schema

Questions are defined in `src/maps/schema.ts` using **Zod**. The top-level union is `questionSchema` with 5 discriminated variants by `id`:

- `radius` — circular radius from a point
- `thermometer` — "warmer/colder" between two points
- `tentacles` — radius from a specific POI type (zoo, museum, etc.)
- `matching` — same zone/airport/POI as the seeker
- `measuring` — distance comparison to a feature type (coastline, rail, etc.)

Each question type has its own processing logic in `src/maps/questions/`:

- `adjustPer*` — filters the base GeoJSON FeatureCollection to matching areas
- `hiderify*` — transforms question data to be from the hider's perspective
- `*PlanningPolygon` — returns the polygon for planning mode display

### API Layer (`src/maps/api/`)

- `overpass.ts` — queries OpenStreetMap via Overpass API for POIs, admin boundaries, train lines, etc.
- `cache.ts` — wraps fetch with the Cache API (3 cache buckets: per-question, per-zone, permanent)
- `geocode.ts` — geocoding via Photon API for place search
- `geo.ts` / `importers.ts` — ArcGIS/GeoJSON data importers for airports, cities, high-speed rail, etc.
- `constants.ts` — Overpass tag mappings and icon color definitions

### Geo Utilities (`src/maps/geo-utils/`)

- `operators.ts` — geometric set operations (intersection, difference) wrapping turf.js
- `voronoi.ts` — Voronoi diagram generation for nearest-feature matching questions
- `stationManipulations.ts` — train station filtering/grouping logic
- `special.ts` — specialized geo operations

### Import Aliases

TypeScript path alias `@/` maps to `src/`. ESLint enforces alias usage (no relative imports crossing directory boundaries).

### UI Components

- `src/components/cards/` — one card component per question type, rendered in the sidebar
- `src/components/ui/` — shadcn/ui primitives (do not modify; regenerate via shadcn CLI if needed)
- `src/components/Map.tsx` — core map component using react-leaflet
- Leaflet must be imported client-side only (SSR incompatible); use `client:only="react"` in Astro

### Key Constraints

- Node.js version must be `<25`
- Package manager: `pnpm` only
- Import sorting is enforced by ESLint (`simple-import-sort`); run `pnpm lint` before committing
- The Overpass API is the primary external data source; queries are cached to avoid re-fetching
