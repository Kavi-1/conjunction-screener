import type { OmmRecord, OrbitRegime, SatelliteRecord } from "./propagate.ts";

export type CatalogGroup = "visual" | "active";

export const CELESTRAK_BASE_URL =
  "https://celestrak.org/NORAD/elements/gp.php";
export const CATALOG_CACHE_SECONDS = 7_200;

const USER_AGENT =
  "Conjunction-Screener/0.1 (educational orbital conjunction visualization)";
const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418;
const EARTH_RADIUS_KM = 6_371;

export interface SatelliteCatalogPayload {
  source: "celestrak";
  group: CatalogGroup;
  fetchedAtUtc: string | null;
  stale: boolean;
  discardedRecords: number;
  satellites: SatelliteRecord[];
  offlineFixture?: boolean;
  fallbackFor?: CatalogGroup;
  /** Upstream reported unchanged data for this IP; our copy may still be older. */
  unchangedUpstream?: boolean;
}

interface CatalogLoaders {
  loadVisual: () => Promise<SatelliteCatalogPayload>;
  loadActive: () => Promise<SatelliteCatalogPayload>;
}

interface LoaderOptions {
  group?: CatalogGroup;
  fetcher?: typeof fetch;
  now?: () => number;
}

export function celestrakCatalogUrl(group: CatalogGroup): string {
  return `${CELESTRAK_BASE_URL}?GROUP=${group.toUpperCase()}&FORMAT=JSON`;
}

/**
 * Celestrak answers a repeat request for unchanged data with HTTP 403 and a
 * plain-text body naming the last successful download, not with an error page.
 * It means "the copy you already have is current", so a cached catalog should
 * be served rather than surfaced as an outage. The status alone is ambiguous —
 * a genuine block is also a 403 — so the body is what distinguishes them.
 */
export function isUnchangedDataResponse(status: number, body: string): boolean {
  return status === 403 && /has not updated since your last successful/i.test(body);
}

export async function loadCatalogWithFallback(
  group: CatalogGroup,
  loaders: CatalogLoaders,
): Promise<SatelliteCatalogPayload> {
  if (group === "visual") return loaders.loadVisual();

  try {
    return await loaders.loadActive();
  } catch {
    const visual = await loaders.loadVisual();
    return { ...visual, fallbackFor: "active" };
  }
}

function finiteNumber(value: unknown): number | null {
  // Number(null) and Number("") are both 0, so a missing element would have
  // been accepted as a real zero eccentricity or inclination.
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function classifyOrbitRegime(
  meanMotionRevDay: number,
  eccentricity: number,
): OrbitRegime {
  if (eccentricity >= 0.25) return "HEO";
  if (meanMotionRevDay >= 0.8 && meanMotionRevDay <= 1.2) return "GEO";

  const radiansPerSecond = (meanMotionRevDay * Math.PI * 2) / 86_400;
  const semiMajorAxisKm = Math.cbrt(
    EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 / radiansPerSecond ** 2,
  );
  const apogeeAltitudeKm = semiMajorAxisKm * (1 + eccentricity) - EARTH_RADIUS_KM;
  return apogeeAltitudeKm <= 2_000 ? "LEO" : "MEO";
}

export function normalizeGpRecord(value: unknown): OmmRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const gp = value as Record<string, unknown>;

  const name = text(gp.OBJECT_NAME);
  const internationalDesignator = text(gp.OBJECT_ID);
  const epoch = text(gp.EPOCH);
  const catalogNumberValue = gp.NORAD_CAT_ID;
  const catalogNumber =
    typeof catalogNumberValue === "number" || typeof catalogNumberValue === "string"
      ? String(catalogNumberValue).trim()
      : null;
  const meanMotionRevDay = finiteNumber(gp.MEAN_MOTION);
  const eccentricity = finiteNumber(gp.ECCENTRICITY);
  const inclinationDeg = finiteNumber(gp.INCLINATION);
  const rightAscensionAscendingNodeDeg = finiteNumber(gp.RA_OF_ASC_NODE);
  const argumentOfPericenterDeg = finiteNumber(gp.ARG_OF_PERICENTER);
  const meanAnomalyDeg = finiteNumber(gp.MEAN_ANOMALY);
  const elementSetNumber = finiteNumber(gp.ELEMENT_SET_NO);
  const bstar = finiteNumber(gp.BSTAR);
  const meanMotionDot = finiteNumber(gp.MEAN_MOTION_DOT);
  const meanMotionDdot = finiteNumber(gp.MEAN_MOTION_DDOT);

  const epochUtc = epoch
    ? new Date(epoch.endsWith("Z") ? epoch : `${epoch}Z`)
    : null;

  if (
    !catalogNumber ||
    !/^\d{1,9}$/.test(catalogNumber) ||
    !epochUtc ||
    !Number.isFinite(epochUtc.getTime()) ||
    meanMotionRevDay === null ||
    meanMotionRevDay <= 0 ||
    eccentricity === null ||
    eccentricity < 0 ||
    eccentricity >= 1 ||
    inclinationDeg === null ||
    inclinationDeg < 0 || inclinationDeg > 180 ||
    rightAscensionAscendingNodeDeg === null ||
    rightAscensionAscendingNodeDeg < 0 || rightAscensionAscendingNodeDeg >= 360 ||
    argumentOfPericenterDeg === null ||
    argumentOfPericenterDeg < 0 || argumentOfPericenterDeg >= 360 ||
    meanAnomalyDeg === null ||
    meanAnomalyDeg < 0 || meanAnomalyDeg >= 360 ||
    elementSetNumber === null ||
    !Number.isInteger(elementSetNumber) || elementSetNumber < 0 ||
    bstar === null ||
    meanMotionDot === null ||
    meanMotionDdot === null
  ) {
    return null;
  }

  return {
    name: name ?? `NORAD ${catalogNumber}`,
    catalogNumber,
    internationalDesignator: internationalDesignator ?? "Not provided",
    regime: classifyOrbitRegime(meanMotionRevDay, eccentricity),
    epochUtc: epochUtc.toISOString(),
    meanMotionRevDay,
    eccentricity,
    inclinationDeg,
    rightAscensionAscendingNodeDeg,
    argumentOfPericenterDeg,
    meanAnomalyDeg,
    elementSetNumber,
    bstar,
    meanMotionDot,
    meanMotionDdot,
  };
}

export function normalizeGpCatalog(value: unknown): {
  satellites: OmmRecord[];
  discardedRecords: number;
} {
  if (!Array.isArray(value)) throw new Error("Celestrak response is not an array");

  const seen = new Set<string>();
  const satellites = value.flatMap((record) => {
    const normalized = normalizeGpRecord(record);
    if (!normalized || seen.has(normalized.catalogNumber)) return [];
    seen.add(normalized.catalogNumber);
    return [normalized];
  });

  if (satellites.length === 0) {
    throw new Error("Celestrak response contains no usable orbital records");
  }

  return { satellites, discardedRecords: value.length - satellites.length };
}

export function createCelestrakLoader({
  group = "visual",
  fetcher = fetch,
  now = Date.now,
}: LoaderOptions = {}) {
  let memoryCache:
    | { payload: SatelliteCatalogPayload; cachedAtMs: number }
    | undefined;
  let inFlight: Promise<SatelliteCatalogPayload> | undefined;
  let lastError: unknown;
  let retryAtMs = 0;

  return async function loadCatalog(): Promise<SatelliteCatalogPayload> {
    const requestedAtMs = now();
    if (!memoryCache && requestedAtMs < retryAtMs) throw lastError;
    if (
      memoryCache &&
      requestedAtMs - memoryCache.cachedAtMs < CATALOG_CACHE_SECONDS * 1_000
    ) {
      return memoryCache.payload;
    }

    if (!inFlight) {
      inFlight = (async () => {
        try {
          const response = await fetcher(celestrakCatalogUrl(group), {
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
            headers: {
              Accept: "application/json",
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            if (isUnchangedDataResponse(response.status, body) && memoryCache) {
              // Upstream asked us to stop re-requesting until it publishes
              // again, so restart the cache clock instead of retrying on every
              // call for the rest of the window.
              // The download belongs to an IP, not necessarily this instance.
              // Never claim that an older local copy is the current version.
              const payload = { ...memoryCache.payload, stale: true, unchangedUpstream: true };
              memoryCache = { payload, cachedAtMs: requestedAtMs };
              return payload;
            }
            throw new Error(`Celestrak returned HTTP ${response.status}`);
          }

          const normalized = normalizeGpCatalog(await response.json());
          const payload: SatelliteCatalogPayload = {
            source: "celestrak",
            group,
            fetchedAtUtc: new Date(requestedAtMs).toISOString(),
            stale: false,
            ...normalized,
          };
          memoryCache = { payload, cachedAtMs: requestedAtMs };
          return payload;
        } catch (error) {
          lastError = error;
          retryAtMs = requestedAtMs + CATALOG_CACHE_SECONDS * 1_000;
          if (memoryCache) {
            const payload = { ...memoryCache.payload, stale: true };
            memoryCache = { payload, cachedAtMs: requestedAtMs };
            return payload;
          }
          throw error;
        }
      })();
    }

    try {
      return await inFlight;
    } finally {
      inFlight = undefined;
    }
  };
}
