// Jest mock for @arcgis/core and all subpath imports (@arcgis/core/*)
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
