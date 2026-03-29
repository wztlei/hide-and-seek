import * as Sentry from "@sentry/react-native";

const SLOW_THRESHOLD_MS = 20_000;

/**
 * Wraps fetch() for Overpass API calls. If the request takes longer than 20 s,
 * a Sentry warning is captured with the elapsed time and any context you pass
 * (query type, bbox, POI type, admin level, etc.).
 */
export async function overpassFetch(
    url: string,
    context: Record<string, unknown>,
): Promise<Response> {
    const start = Date.now();
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_THRESHOLD_MS) {
        Sentry.captureMessage(
            `Overpass query slow (${Math.round(elapsed / 1000)}s)`,
            { level: "warning", extra: { elapsed_ms: elapsed, ...context } },
        );
    }
    return res;
}
