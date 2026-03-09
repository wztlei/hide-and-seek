# Hide and Seek — Mobile App

React Native / Expo app for the [Hide and Seek web app](../README.md).

## Prerequisites

- [Node.js](https://nodejs.org/) < 25
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Xcode](https://developer.apple.com/xcode/) (iOS) or [Android Studio](https://developer.android.com/studio) (Android)

## Install

From the **monorepo root**:

```bash
pnpm install
```

## Running on a Simulator

Build and launch in the iOS or Android simulator (first run compiles native code — takes a few minutes):

```bash
cd mobile
npx expo run:ios       # iOS simulator
npx expo run:android   # Android emulator
```

After the first build, start the dev server without recompiling:

```bash
npx expo start
# then press `i` for iOS simulator, `a` for Android emulator
```

> **Note:** Expo Go is not supported — this app uses `@maplibre/maplibre-react-native`, a custom native module. You must use the dev build installed by `expo run:*`.

## Running on a Physical Device

### iOS (USB)

1. Connect your iPhone via USB and tap **Trust** on the device prompt
2. Run:
    ```bash
    cd mobile
    npx expo run:ios --device
    ```
3. Select your device from the list
4. After the build installs, go to **Settings → General → VPN & Device Management → [your Apple ID] → Trust**

You'll need an Apple Developer team configured — set `ios.bundleIdentifier` in `app.json` and select your team in Xcode if prompted.

### Android (USB)

1. Enable **Developer Options** and **USB Debugging** on your device
2. Connect via USB
3. Run:
    ```bash
    cd mobile
    npx expo run:android --device
    ```

## Dev Loop

Once the app is installed on a simulator or device, Metro handles JS changes via Fast Refresh — no rebuild needed unless you change native dependencies.

| Key | Action           |
| --- | ---------------- |
| `r` | Force reload     |
| `j` | Open JS debugger |
| `m` | Toggle dev menu  |

Rebuild native code (`expo run:*`) only when you:

- Add or update a package with native code
- Change native config fields in `app.json`

## Tests

```bash
cd mobile
npx jest --watchAll=false
```

## Project Structure

```
mobile/
├── app/              # Expo Router screens (_layout.tsx, index.tsx)
├── components/       # React Native UI components
├── lib/              # Mobile-specific implementations (storage, cache, etc.)
├── __tests__/        # Jest test suites
├── __mocks__/        # Module stubs (ArcGIS, etc.)
└── metro.config.js   # Metro bundler config (monorepo + NativeWind)
```

Shared business logic lives in `../src/maps/` and is imported directly via Metro's `watchFolders` config.
