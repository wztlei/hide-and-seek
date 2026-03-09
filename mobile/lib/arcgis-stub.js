/**
 * Stub for @arcgis/core — not supported in React Native.
 * Redirected by metro.config.js resolveRequest for all @arcgis/core/* imports.
 *
 * Operators (geodesicBuffer, geodeticDistance) are Phase 2 scope.
 * When Phase 2 adds question processing, this must be replaced with
 * turf.js equivalents (e.g. turf.buffer for geodesicBuffer).
 */
module.exports = new Proxy(
    {},
    {
        get: () =>
            new Proxy(function () {}, {
                get: () =>
                    new Proxy(function () {}, { get: () => function () {} }),
                apply: () => Promise.resolve(),
                construct: () => ({}),
            }),
    },
);
