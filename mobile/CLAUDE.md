# Mobile App — Claude Guidance

This is the Expo React Native app (`mobile/`). It shares business logic with the root web app via Metro's monorepo watch config (`metro.config.js`).

## Stack

| Tool | Version | Notes |
|------|---------|-------|
| Expo | ~54 | Managed workflow |
| React Native | 0.81 | New Architecture supported |
| NativeWind | ^4 | Tailwind for RN — use `className` on core RN components |
| MapLibre RN | ^10 | See below |

## NativeWind

Use `className` on core React Native components (`View`, `Text`, `Pressable`, etc.). Third-party components only accept `className` if they explicitly extend `ViewProps` with it — always check their `.d.ts` before using `className` on them. When in doubt, use `style`.

## MapLibre React Native

Docs: https://maplibre.org/maplibre-react-native/
Package: `@maplibre/maplibre-react-native`

### Setup

```ts
import { setAccessToken } from '@maplibre/maplibre-react-native';
setAccessToken(null); // required module-level call when not using Mapbox
```

`mapStyle` accepts a style URL string or a Style JSON string/object. Pass a JSON-stringified object to use custom tile sources (CartoDB, Thunderforest, etc.).

### Key Components

#### `MapView`

Only accepts `style` (not `className`) — it uses `ViewProps["style"]`.

```tsx
<MapView
  style={{ flex: 1 }}
  mapStyle={styleJSON}        // string (URL) or object (Style JSON)
  compassEnabled              // show compass
  logoEnabled={false}
  attributionEnabled={false}
  onPress={handler}           // (feature: GeoJSON.Feature) => void
  onLongPress={handler}
  onDidFinishLoadingMap={cb}  // fires when style finishes loading
/>
```

#### `Camera`

Must be a child of `MapView`. Use `defaultSettings` for initial position — setting `centerCoordinate`/`zoomLevel` directly on the prop causes the camera to snap back on every render.

```tsx
<Camera
  ref={cameraRef}                           // CameraRef
  defaultSettings={{ centerCoordinate: [lng, lat], zoomLevel: 5 }}
  followUserLocation={false}
  followZoomLevel={15}
/>
```

**CameraRef methods** (imperative, via `ref`):
- `setCamera(config: CameraStop)` — preferred for combined center+zoom moves
- `flyTo(coordinates, animationDuration?)` — center only
- `moveTo(coordinates, animationDuration?)` — center only, no arc
- `zoomTo(zoomLevel, animationDuration?)` — zoom only
- `fitBounds(ne, sw, padding?, animationDuration?)`

**CameraStop shape:**
```ts
{
  centerCoordinate?: GeoJSON.Position   // [lng, lat]
  zoomLevel?: number
  animationMode?: 'flyTo' | 'easeTo' | 'linearTo' | 'moveTo'
  animationDuration?: number            // ms
  bounds?: { ne, sw, ...padding }
  heading?: number
  pitch?: number
}
```

> Always use `setCamera` when setting both `centerCoordinate` and `zoomLevel` — calling `flyTo` and `zoomTo` separately launches two competing animations.

#### `UserLocation`

Subscribes to device GPS. Must be inside `MapView`. Starts automatically when `visible` or `onUpdate` are set.

```tsx
<UserLocation
  visible={false}           // hide the default dot if rendering a custom one
  onUpdate={(loc) => {      // loc.coords.longitude / loc.coords.latitude
    setCoord([loc.coords.longitude, loc.coords.latitude]);
  }}
  minDisplacement={5}       // metres before next update
/>
```

Does **not** request permissions itself — call `Location.requestForegroundPermissionsAsync()` (expo-location) first.

#### `MarkerView`

Places an interactive React Native view anchored to a map coordinate. Always rendered on top (no z-index control). For static markers prefer `PointAnnotation` or `SymbolLayer` (better performance).

```tsx
<MarkerView
  coordinate={[lng, lat]}          // required, [lng, lat]
  anchor={{ x: 0.5, y: 0.5 }}      // default: center
  allowOverlap={false}
>
  <View>...</View>   {/* single ReactElement child */}
</MarkerView>
```

#### `PointAnnotation`

Like `MarkerView` but children are rasterised to a bitmap on Android — better performance for static content, no interactivity. Requires `id`.

```tsx
<PointAnnotation id="pin" coordinate={[lng, lat]}>
  <View>...</View>
</PointAnnotation>
```

#### Layer + Source components

`ShapeSource` + `CircleLayer` / `FillLayer` / `LineLayer` / `SymbolLayer` — render GeoJSON data as map layers. Support style expressions and clustering. Do **not** accept `className`.

### Coordinate convention

MapLibre everywhere expects **`[longitude, latitude]`** (GeoJSON order).
The `mapGeoLocation` nanostore uses **`[latitude, longitude]`** (non-standard). Always swap when passing to Camera or MarkerView:

```ts
const center: [number, number] = [
  $mapGeoLocation.geometry.coordinates[1], // longitude
  $mapGeoLocation.geometry.coordinates[0], // latitude
];
```

### Annotation type comparison

| | `CircleLayer` | `SymbolLayer` | `PointAnnotation` | `MarkerView` |
|---|---|---|---|---|
| RN children | No | Limited (static iOS) | Interactive iOS / bitmap Android | Interactive |
| Clustering | Yes | Yes | No | No |
| Style expressions | Yes | Yes | No | No |
| Z-index control | Yes | Yes | Platform-limited | Always top |
| Performance | Best | Best | Good | Worst |
