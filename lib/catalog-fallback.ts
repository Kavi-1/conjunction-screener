import fixture from "../fixtures/satellites.json" with { type: "json" };
import type { TleRecord } from "./propagate.ts";
import type { CatalogGroup, SatelliteCatalogPayload } from "./celestrak.ts";

/** A real offline demonstration, never a fabricated successful live fetch. */
export function offlineCatalog(group: CatalogGroup): SatelliteCatalogPayload {
  return {
    source: "celestrak",
    group,
    fetchedAtUtc: null,
    stale: true,
    offlineFixture: true,
    discardedRecords: 0,
    satellites: fixture as TleRecord[],
  };
}
