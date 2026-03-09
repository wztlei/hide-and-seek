import AsyncStorage from "@react-native-async-storage/async-storage";

import { CacheType } from "../../../src/maps/api/types";
import { cacheFetch, clearCache } from "../../lib/cache";

// AsyncStorage is mocked via jest.setup.ts
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("cacheFetch", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    });

    it("returns cached response without fetching", async () => {
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{"data":1}');

        const res = await cacheFetch("https://example.com/data");
        expect(mockFetch).not.toHaveBeenCalled();
        expect(await res.text()).toBe('{"data":1}');
    });

    it("fetches and stores in AsyncStorage on cache miss", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            text: async () => '{"fresh":true}',
        });

        const res = await cacheFetch("https://example.com/fresh");
        expect(mockFetch).toHaveBeenCalledWith("https://example.com/fresh");
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            `${CacheType.CACHE}::https://example.com/fresh`,
            '{"fresh":true}',
        );
        expect(await res.text()).toBe('{"fresh":true}');
    });

    it("uses correct key prefix for each cache type", async () => {
        mockFetch.mockResolvedValue({ ok: true, text: async () => "data" });

        await cacheFetch("https://x.com", undefined, CacheType.ZONE_CACHE);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            `${CacheType.ZONE_CACHE}::https://x.com`,
            "data",
        );
    });

    it("deduplicates in-flight requests for the same URL", async () => {
        let resolveFetch!: (v: unknown) => void;
        const fetchPromise = new Promise((r) => (resolveFetch = r));
        mockFetch.mockReturnValue(fetchPromise);

        const p1 = cacheFetch("https://slow.com");
        const p2 = cacheFetch("https://slow.com");

        resolveFetch({ ok: true, text: async () => "slow-data" });
        await Promise.all([p1, p2]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to direct fetch on error", async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValue(
            new Error("storage failure"),
        );
        mockFetch.mockResolvedValue({ ok: true, text: async () => "fallback" });

        const res = await cacheFetch("https://fallback.com");
        expect(await res.text()).toBe("fallback");
    });
});

describe("clearCache", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    });

    it("removes only keys matching the given cache type prefix", async () => {
        (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
            `${CacheType.CACHE}::url1`,
            `${CacheType.CACHE}::url2`,
            `${CacheType.ZONE_CACHE}::url3`,
        ]);

        await clearCache(CacheType.CACHE);

        expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
            `${CacheType.CACHE}::url1`,
            `${CacheType.CACHE}::url2`,
        ]);
    });

    it("does nothing when no matching keys exist", async () => {
        (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
            `${CacheType.ZONE_CACHE}::url`,
        ]);

        await clearCache(CacheType.CACHE);
        expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    });
});
