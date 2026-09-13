import { CATALOG_CACHE_SECONDS, type SatelliteCatalogPayload } from "./celestrak.ts";

export const CATALOG_RETRY_MS = 60_000;

/** Successful catalogs can be reused for hours; demo data must not pin an outage. */
export function createCatalogClient(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: SatelliteCatalogPayload | null = null;
  let expiresAtMs = 0;
  let inFlight: Promise<SatelliteCatalogPayload> | null = null;

  return function requestCatalog(force = false): Promise<SatelliteCatalogPayload> {
    if (inFlight) return inFlight;
    if (!force && cached && now() < expiresAtMs) return Promise.resolve(cached);

    inFlight = (async () => {
      const response = await fetcher("/api/tle", {
        headers: { Accept: "application/json" },
        // Honor the route's cache headers. Forcing no-store also bypasses
        // Next's development data cache, losing its last usable catalog.
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Could not load satellite data (HTTP ${response.status}).`);
      const payload = await response.json() as SatelliteCatalogPayload;
      if (!payload || payload.source !== "celestrak" ||
          !Array.isArray(payload.satellites) || payload.satellites.length === 0) {
        throw new Error("Could not read the satellite data.");
      }
      const degraded = payload.offlineFixture || payload.stale;
      // An offline response must not replace a previously downloaded catalog.
      cached = payload.offlineFixture && cached && !cached.offlineFixture
        ? { ...cached, stale: true }
        : payload;
      expiresAtMs = now() + (degraded ? CATALOG_RETRY_MS : CATALOG_CACHE_SECONDS * 1_000);
      return cached;
    })().catch((error: unknown) => {
      if (!cached) throw error;
      cached = { ...cached, stale: true };
      expiresAtMs = now() + CATALOG_RETRY_MS;
      return cached;
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
}
