export const colors = {
    // ── App chrome ────────────────────────────────────────────────────────────
    // Used for UI elements: FABs, banners, user location dot, zone overlay.
    PRIMARY: "#2d2d86", // dark navy-grey

    // ── Zone boundary overlay ─────────────────────────────────────────────────
    ZONE_MASK: "#2d2d86", // dark navy-grey (fill at 0.2 opacity, line solid)

    // ── Question types ────────────────────────────────────────────────────────
    RADIUS: "#ef4444", // red-500     — "within this circle?"
    THERMOMETER: "#a855f7", // purple-500  — "warmer or colder?"
    TENTACLES: "#22c55e", // green-500   — "near this type of place?"
    MATCHING: "#f59e0b", // amber-500   — "same zone / feature?"
    MEASURING: "#06b6d4", // cyan-500    — "closer than the seeker?"

    // ── Thermometer point markers ─────────────────────────────────────────────
    THERMOMETER_A: "#f97316", // orange-500 — warm / start point
    THERMOMETER_B: "#a855f7", // purple-500 — cool / end point (= THERMOMETER)
} as const;
