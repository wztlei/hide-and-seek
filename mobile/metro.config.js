const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const {
    getSentryExpoConfig
} = require("@sentry/react-native/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

const config = getSentryExpoConfig(projectRoot);

// Watch the monorepo root so shared src/ can be imported
config.watchFolders = [monorepoRoot];

// Resolve node_modules from both mobile/ and root
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
];

// Force singleton packages to resolve to the root copy, preventing pnpm's
// per-package symlinks from creating two instances of react/react-native.
config.resolver.extraNodeModules = {
    react: path.resolve(monorepoRoot, "node_modules/react"),
    "react-native": path.resolve(monorepoRoot, "node_modules/react-native"),
};

// Path alias and browser-API redirects for shared src/ code
config.resolver.resolveRequest = (context, moduleName, platform) => {
    // @/ → src/ (TypeScript paths alias used throughout shared code)
    if (moduleName.startsWith("@/")) {
        const absolutePath = path.resolve(
            monorepoRoot,
            "src",
            moduleName.slice(2),
        );
        return context.resolveRequest(context, absolutePath, platform);
    }

    // @arcgis/core and all subpaths → no-op stub (browser-only ArcGIS SDK)
    if (moduleName.startsWith("@arcgis/core")) {
        return {
            filePath: path.resolve(projectRoot, "lib", "arcgis-stub.js"),
            type: "sourceFile",
        };
    }

    // ./cache imported from src/maps/api/ → AsyncStorage implementation
    if (
        moduleName === "./cache" &&
        context.originModulePath &&
        context.originModulePath.startsWith(
            path.resolve(monorepoRoot, "src", "maps", "api"),
        )
    ) {
        return context.resolveRequest(
            context,
            path.resolve(projectRoot, "lib", "cache"),
            platform,
        );
    }

    return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });