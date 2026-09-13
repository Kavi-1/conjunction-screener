export const CNEOS_CAD_URL =
  "https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B60&dist-max=0.05&body=Earth&kind=a&sort=date&diameter=true&fullname=true";
export const NEO_CACHE_SECONDS = 21_600;

const ASTRONOMICAL_UNIT_KM = 149_597_870.7;
const USER_AGENT =
  "Conjunction-Screener/0.1 (educational close-approach visualization)";

export interface NeoApproach {
  id: string;
  designation: string;
  name: string;
  orbitId: string;
  tcaTdb: string;
  missDistanceKm: number;
  minimumDistanceKm: number;
  maximumDistanceKm: number;
  relativeVelocityKmS: number;
  timeUncertainty: string;
  diameterKm: number | null;
  diameterSigmaKm: number | null;
}

export interface NeoApproachPayload {
  source: "nasa-jpl-cneos";
  apiVersion: "1.5";
  fetchedAtUtc: string;
  stale: boolean;
  approaches: NeoApproach[];
}

interface LoaderOptions {
  fetcher?: typeof fetch;
  now?: () => number;
}

function numeric(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueAt(
  row: unknown[],
  fieldIndexes: Map<string, number>,
  field: string,
): unknown {
  const index = fieldIndexes.get(field);
  return index === undefined ? undefined : row[index];
}

export function normalizeCadResponse(value: unknown): NeoApproach[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JPL response is not an object");
  }
  const response = value as Record<string, unknown>;
  const signature = response.signature as Record<string, unknown> | undefined;
  if (signature?.version !== "1.5") {
    throw new Error("JPL CAD API version is not supported");
  }
  if (response.count === 0) return [];
  if (!Array.isArray(response.fields) || !Array.isArray(response.data)) {
    throw new Error("JPL response is missing fields or data");
  }

  const fieldIndexes = new Map(
    response.fields.map((field, index) => [String(field), index]),
  );
  const approaches = response.data.flatMap((candidate) => {
    if (!Array.isArray(candidate)) return [];
    const designation = String(valueAt(candidate, fieldIndexes, "des") ?? "").trim();
    const orbitId = String(valueAt(candidate, fieldIndexes, "orbit_id") ?? "").trim();
    const tcaTdb = String(valueAt(candidate, fieldIndexes, "cd") ?? "").trim();
    const distanceAu = numeric(valueAt(candidate, fieldIndexes, "dist"));
    const minimumDistanceAu = numeric(valueAt(candidate, fieldIndexes, "dist_min"));
    const maximumDistanceAu = numeric(valueAt(candidate, fieldIndexes, "dist_max"));
    const relativeVelocityKmS = numeric(valueAt(candidate, fieldIndexes, "v_rel"));
    if (
      !designation ||
      !orbitId ||
      !tcaTdb ||
      distanceAu === null ||
      minimumDistanceAu === null ||
      maximumDistanceAu === null ||
      relativeVelocityKmS === null || relativeVelocityKmS < 0 ||
      minimumDistanceAu < 0 || distanceAu < minimumDistanceAu || maximumDistanceAu < distanceAu
    ) {
      return [];
    }

    // JPL wraps the designation of an unnamed body in parentheses, e.g.
    // "       (2026 RL10)". Named bodies come through as "433 Eros (A898 PA)".
    const name = String(
      valueAt(candidate, fieldIndexes, "fullname") ?? designation,
    )
      .trim()
      .replace(/^\((.+)\)$/, "$1")
      .trim();
    const diameterKm = numeric(valueAt(candidate, fieldIndexes, "diameter"));
    const diameterSigmaKm = numeric(
      valueAt(candidate, fieldIndexes, "diameter_sigma"),
    );
    if ((diameterKm !== null && diameterKm < 0) || (diameterSigmaKm !== null && diameterSigmaKm < 0)) return [];
    return [{
      id: `${designation}-${orbitId}-${tcaTdb}`,
      designation,
      name: name || designation,
      orbitId,
      tcaTdb,
      missDistanceKm: distanceAu * ASTRONOMICAL_UNIT_KM,
      minimumDistanceKm: minimumDistanceAu * ASTRONOMICAL_UNIT_KM,
      maximumDistanceKm: maximumDistanceAu * ASTRONOMICAL_UNIT_KM,
      relativeVelocityKmS,
      timeUncertainty: String(
        valueAt(candidate, fieldIndexes, "t_sigma_f") ?? "unknown",
      ).trim(),
      diameterKm,
      diameterSigmaKm,
    }];
  });
  if (approaches.length !== response.data.length || numeric(response.count) !== approaches.length) {
    throw new Error("JPL response contains invalid or missing approach records");
  }
  return approaches;
}

export function createCneosLoader({
  fetcher = fetch,
  now = Date.now,
}: LoaderOptions = {}) {
  let memoryCache: { payload: NeoApproachPayload; cachedAtMs: number } | undefined;
  let inFlight: Promise<NeoApproachPayload> | undefined;

  return async function loadApproaches(): Promise<NeoApproachPayload> {
    const requestedAtMs = now();
    if (
      memoryCache &&
      requestedAtMs - memoryCache.cachedAtMs < NEO_CACHE_SECONDS * 1_000
    ) return memoryCache.payload;

    if (!inFlight) {
      inFlight = (async () => {
        try {
          const response = await fetcher(CNEOS_CAD_URL, {
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
            headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          });
          if (!response.ok) throw new Error(`JPL returned HTTP ${response.status}`);
          const payload: NeoApproachPayload = {
            source: "nasa-jpl-cneos",
            apiVersion: "1.5",
            fetchedAtUtc: new Date(requestedAtMs).toISOString(),
            stale: false,
            approaches: normalizeCadResponse(await response.json()),
          };
          memoryCache = { payload, cachedAtMs: requestedAtMs };
          return payload;
        } catch (error) {
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
