# mobile/lib — Data Layer

## Caching Architecture

The app has three tiers of caching for Overpass API and static asset data.

---

### Tier 1 — In-memory permanent (session lifetime)

Used for data that never changes or is global and expensive to re-fetch.

| Data                           | Location                                    | Key                                                  |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| Coastline GeoJSON              | `measuringApi.ts` `coastlineCache`          | module-level `let`                                   |
| High-speed rail lines          | `measuringApi.ts` `highSpeedRailCache`      | module-level `let`                                   |
| Global airports (matching)     | `matchingApi.ts` `airportsCache.promise`    | singleton promise                                    |
| Global major cities (matching) | `matchingApi.ts` `majorCitiesCache.promise` | singleton promise                                    |
| Admin boundaries               | `matchingApi.ts` `adminBoundaryCache`       | `Map<string, Promise>` keyed on `lat,lng,adminLevel` |
| Admin sub-levels               | `matchingApi.ts` `adminSubLevelsCache`      | `Map<string, Promise>` keyed on `lat,lng,zoneOsmId`  |

These caches are plain JS variables — they reset when the app is cold-started.

---

### Tier 2 — Persistent LRU (survives app restarts)

Used for bbox-scoped Overpass queries that vary by game zone and search area. Stored in AsyncStorage via the `memStore` mirror in `storage.ts`.

Two independent LRU namespaces:

| Namespace                          | Key prefix               | LRU list key       | Cap | Source            |
| ---------------------------------- | ------------------------ | ------------------ | --- | ----------------- |
| Matching POIs                      | `poi:<type>:<bbox>`      | `poi:__lru__`      | 50  | `matchingApi.ts`  |
| Measuring POIs / airports / cities | `meas-poi:<type>:<bbox>` | `meas-poi:__lru__` | 50  | `measuringApi.ts` |

**Key format:** `<prefix>:<type>:<w.ww>,<s.ss>,<e.ee>,<n.nn>`
Bbox coordinates are rounded to 2 decimal places (~1 km) so small zone adjustments hit the cache.

**LRU eviction:** When the list exceeds the cap, the oldest entry is deleted from AsyncStorage (`deleteCached`). The most-recently-used entry is always moved to the end of the list on every read or write.

**Helper functions** (same pattern in both files):

- `<ns>PersistentGet(key)` — synchronous read from `memStore`; promotes to MRU on hit.
- `<ns>PersistentSet(key, features)` — writes to `memStore`/AsyncStorage; evicts if over cap.

---

### Tier 3 — In-flight deduplication (concurrent request guard)

Layered on top of tier 2. Prevents multiple callers from issuing the same Overpass request concurrently within a session.

```
measPoiInFlight / poiInFlight: Map<storeKey, Promise<Feature<Point>[]>>
```

**Request flow for any bbox-scoped fetch:**

1. Check persistent cache (`getCached`) — return immediately on hit.
2. Check in-flight map — if a promise exists for the same key, `await` it and return.
3. Create and register a new promise in the in-flight map.
4. Fetch from Overpass, persist result (`setCached`), remove from in-flight map, return.

---

### `storage.ts` — AsyncStorage bridge

`@nanostores/persistent` normally uses `localStorage`. `storage.ts` replaces the engine with a Proxy over an in-memory `memStore` object:

- **Writes** (`storageProxy[key] = value`) update `memStore` synchronously and persist to AsyncStorage asynchronously.
- **Deletes** remove from both.
- **`storageReady`** — a Promise exported for `_layout.tsx` to `await` before rendering; it pre-loads all AsyncStorage keys into `memStore` so atom `restore()` reads persisted values immediately.

The three cache helpers exposed by `storage.ts`:

- `getCached(key)` — synchronous read from `memStore`.
- `setCached(key, value)` — sync write to `memStore` + async persist.
- `deleteCached(key)` — sync delete from `memStore` + async remove.

---

## Bbox conventions

All Overpass queries use the format `(south, west, north, east)`.
All internal bbox tuples follow turf.js GeoJSON order: `[west, south, east, north]` (i.e. `[minLng, minLat, maxLng, maxLat]`).

### Measuring bbox strategy (`useEliminationMask.ts`)

Measuring questions support two relevant points:

- **Seeker location** (`lat`/`lng`) — always searched; determines the buffer radius.
- **Additional search region** (`poiSearchLat`/`poiSearchLng`) — optional; when set, an independent Overpass query is run around this second center.

When an additional search region is set, **two separate fetches** are issued (each using `poiBbox`), the results are deduplicated by coordinate, and the POIs are kept as two distinct lists:

| Field            | Contents                                                   |
| ---------------- | ---------------------------------------------------------- |
| `pois`           | POIs found around the seeker location                      |
| `additionalPois` | POIs found exclusively around the additional search region |

Both lists are passed to `buildPOIUnionBuffer` with a **proportional cap**: each group gets up to `MAX_UNION_POIS / 2` slots, with unused slots redistributed to the other group. The seeker group is sorted by seeker distance; the additional group is sorted by distance from the additional center.

Separate fetches are better for cache efficiency than a merged bbox: changing only the seeker location misses only the seeker cache entry, and vice versa.

Matching questions use a single-center `poiBbox` helper (only the seeker location, no additional region concept).
