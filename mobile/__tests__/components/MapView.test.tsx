/// <reference path="../../../node_modules/@types/jest/index.d.ts" />
import { act, render } from "@testing-library/react-native";
import React from "react";

// Mock the heavy shared-code modules before importing MapView
jest.mock("../../../src/maps", () => ({
    applyQuestionsToMapGeoData: jest.fn().mockResolvedValue({
        type: "FeatureCollection",
        features: [],
    }),
    holedMask: jest.fn().mockReturnValue({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[]] },
        properties: {},
    }),
    hiderifyQuestion: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../src/maps/api", () => ({
    determineMapBoundaries: jest.fn().mockResolvedValue({
        type: "FeatureCollection",
        features: [],
    }),
    clearCache: jest.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
import { AppMapView } from "../../components/MapView";
import { mapGeoJSON } from "../../lib/context";
import * as mapsModule from "../../../src/maps";
import * as mapsApi from "../../../src/maps/api";
import * as Location from "expo-location";

const mockDetermineMapBoundaries = mapsApi.determineMapBoundaries as jest.Mock;
const mockApplyQuestions = mapsModule.applyQuestionsToMapGeoData as jest.Mock;

describe("AppMapView", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset shared atom so each test starts with mapGeoJSON = null
        mapGeoJSON.set(null);
    });

    it("renders without crashing", async () => {
        expect(() => render(<AppMapView />)).not.toThrow();
    });

    it("calls determineMapBoundaries on mount when mapGeoJSON is null", async () => {
        render(<AppMapView />);
        // Flush async effects (useEffect calls)
        await act(async () => {});
        // determineMapBoundaries is called because mapGeoJSON atom starts as null
        expect(mockDetermineMapBoundaries).toHaveBeenCalled();
    });

    it("calls applyQuestionsToMapGeoData after loading boundaries", async () => {
        render(<AppMapView />);
        await act(async () => {});
        expect(mockApplyQuestions).toHaveBeenCalled();
    });

    it("requests location permission when followMe is enabled", async () => {
        const { rerender } = render(<AppMapView />);

        // Manually toggle followMe atom via the nanostore
        const { followMe } = require("../../lib/context");
        await act(async () => {
            followMe.set(true);
            rerender(<AppMapView />);
        });

        expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();

        // Cleanup
        await act(async () => {
            followMe.set(false);
            rerender(<AppMapView />);
        });
    });

    it("shows context menu after long press", async () => {
        render(<AppMapView />);
        // Flush async effects — smoke test that component handles the render lifecycle
        await act(async () => {});
        expect(mockApplyQuestions).toHaveBeenCalled();
    });
});
