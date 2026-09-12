import type { OmmRecord, OrbitRegime } from "@/lib/propagate";

export const CELESTRAK_VISUAL_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=VISUAL&FORMAT=JSON";
export const CATALOG_CACHE_SECONDS = 7_200;

const USER_AGENT =
  "Miss-Distance/0.1 (educational orbital conjunction visualization)";
const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418;
const EARTH_RADIUS_KM = 6_371;

export interface SatelliteCatalogPayload {
  source: "celestrak";
  group: "visual";
  fetchedAtUtc: string;
  stale: boolean;
  discardedRecords: number;
  satellites: OmmRecord[];
}

interface LoaderOptions {
  fetcher?: typeof fetch;
  now?: () => number;
}

function finiteNumber(value: unknown): number | null {
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
    !name ||
    !internationalDesignator ||
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
    rightAscensionAscendingNodeDeg === null ||
    argumentOfPericenterDeg === null ||
    meanAnomalyDeg === null ||
    elementSetNumber === null ||
    bstar === null ||
    meanMotionDot === null ||
    meanMotionDdot === null
  ) {
    return null;
  }

  return {
    name,
    catalogNumber,
    internationalDesignator,
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

  const satellites = value.flatMap((record) => {
    const normalized = normalizeGpRecord(record);
    return normalized ? [normalized] : [];
  });

  if (satellites.length === 0) {
    throw new Error("Celestrak response contains no usable orbital records");
  }

  return { satellites, discardedRecords: value.length - satellites.length };
}

export function createCelestrakLoader({
  fetcher = fetch,
  now = Date.now,
}: LoaderOptions = {}) {
  let memoryCache:
    | { payload: SatelliteCatalogPayload; cachedAtMs: number }
    | undefined;
  let inFlight: Promise<SatelliteCatalogPayload> | undefined;

  return async function loadCatalog(): Promise<SatelliteCatalogPayload> {
    const requestedAtMs = now();
    if (
      memoryCache &&
      requestedAtMs - memoryCache.cachedAtMs < CATALOG_CACHE_SECONDS * 1_000
    ) {
      return memoryCache.payload;
    }

    if (!inFlight) {
      inFlight = (async () => {
        try {
          const response = await fetcher(CELESTRAK_VISUAL_URL, {
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            throw new Error(`Celestrak returned HTTP ${response.status}`);
          }

          const normalized = normalizeGpCatalog(await response.json());
          const payload: SatelliteCatalogPayload = {
            source: "celestrak",
            group: "visual",
            fetchedAtUtc: new Date(requestedAtMs).toISOString(),
            stale: false,
            ...normalized,
          };
          memoryCache = { payload, cachedAtMs: requestedAtMs };
          return payload;
        } catch (error) {
          if (memoryCache) return { ...memoryCache.payload, stale: true };
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
