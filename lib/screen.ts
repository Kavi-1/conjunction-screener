import { elementEpochUtc, createSatellitePropagator } from "./propagate.ts";
import type {
  PropagationStateEci,
  SatellitePropagator,
  SatelliteRecord,
} from "./propagate.ts";
import {
  apsisBandsOverlap,
  minimumOrbitPathDistanceKm,
  orbitGeometry,
} from "./screen-geometry.ts";

const HOURS_TO_MS = 3_600_000;
const PATH_GATE_NUMERICAL_MARGIN_KM = 25;
const MAX_LEO_RELATIVE_SPEED_KM_S = 20;
const MAX_REPORTED_APPROACHES = 100;

export interface ScreeningOptions {
  startUtc: string;
  windowHours: number;
  thresholdKm: number;
  maxObjects: number;
  coarseStepSeconds?: number;
}

export type ScreeningStage = "prepare" | "apsis" | "path" | "propagate";

export interface ScreeningProgress {
  stage: ScreeningStage;
  completed: number;
  total: number;
}

export interface RangeSample {
  atUtc: string;
  rangeKm: number;
}

export interface ConjunctionResult {
  id: string;
  first: Pick<SatelliteRecord, "name" | "catalogNumber">;
  second: Pick<SatelliteRecord, "name" | "catalogNumber">;
  tcaUtc: string;
  missDistanceKm: number;
  relativeVelocityKmS: number;
  oldestElementAgeHours: number;
  rangeSeries: RangeSample[];
}

export interface ScreeningStats {
  catalogObjects: number;
  eligibleLeoObjects: number;
  screenedObjects: number;
  initialPairs: number;
  afterApsisPairs: number;
  afterPathPairs: number;
  elapsedMs: number;
}

export interface ScreeningReport {
  options: Required<ScreeningOptions>;
  stats: ScreeningStats;
  results: ConjunctionResult[];
}

interface IndexedPair {
  firstIndex: number;
  secondIndex: number;
}

interface RangeState {
  rangeSquaredKm: number;
  first: PropagationStateEci;
  second: PropagationStateEci;
}

function pairCount(objectCount: number): number {
  return (objectCount * (objectCount - 1)) / 2;
}

function reportProgress(
  onProgress: ((progress: ScreeningProgress) => void) | undefined,
  stage: ScreeningStage,
  completed: number,
  total: number,
): void {
  if (completed === total || completed % 250 === 0) {
    onProgress?.({ stage, completed, total });
  }
}

function rangeStateAtMs(
  first: SatellitePropagator,
  second: SatellitePropagator,
  atMs: number,
): RangeState | null {
  const atUtc = new Date(atMs);
  const firstState = first(atUtc);
  const secondState = second(atUtc);
  if (!firstState || !secondState) return null;
  return {
    rangeSquaredKm:
      (firstState.positionEciKm.x - secondState.positionEciKm.x) ** 2 +
      (firstState.positionEciKm.y - secondState.positionEciKm.y) ** 2 +
      (firstState.positionEciKm.z - secondState.positionEciKm.z) ** 2,
    first: firstState,
    second: secondState,
  };
}

function refineTimeOfClosestApproach(
  first: SatellitePropagator,
  second: SatellitePropagator,
  lowMs: number,
  highMs: number,
): { atMs: number; state: RangeState } | null {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let leftMs = highMs - ratio * (highMs - lowMs);
  let rightMs = lowMs + ratio * (highMs - lowMs);
  let leftState = rangeStateAtMs(first, second, leftMs);
  let rightState = rangeStateAtMs(first, second, rightMs);
  if (!leftState || !rightState) return null;

  // A 250 ms bracket is comfortably below the requested one-second precision.
  while (highMs - lowMs > 250) {
    if (leftState.rangeSquaredKm < rightState.rangeSquaredKm) {
      highMs = rightMs;
      rightMs = leftMs;
      rightState = leftState;
      leftMs = highMs - ratio * (highMs - lowMs);
      leftState = rangeStateAtMs(first, second, leftMs);
      if (!leftState) return null;
    } else {
      lowMs = leftMs;
      leftMs = rightMs;
      leftState = rightState;
      rightMs = lowMs + ratio * (highMs - lowMs);
      rightState = rangeStateAtMs(first, second, rightMs);
      if (!rightState) return null;
    }
  }

  return leftState.rangeSquaredKm < rightState.rangeSquaredKm
    ? { atMs: leftMs, state: leftState }
    : { atMs: rightMs, state: rightState };
}

function relativeVelocityKmS(state: RangeState): number {
  return Math.hypot(
    state.first.velocityEciKmS.x - state.second.velocityEciKmS.x,
    state.first.velocityEciKmS.y - state.second.velocityEciKmS.y,
    state.first.velocityEciKmS.z - state.second.velocityEciKmS.z,
  );
}

function rangeSeries(
  first: SatellitePropagator,
  second: SatellitePropagator,
  tcaMs: number,
  startMs: number,
  endMs: number,
): RangeSample[] {
  const halfSpanMs = Math.min(30 * 60_000, (endMs - startMs) / 2);
  const seriesStartMs = Math.max(startMs, tcaMs - halfSpanMs);
  const seriesEndMs = Math.min(endMs, tcaMs + halfSpanMs);
  return Array.from({ length: 31 }, (_, index) => {
    const atMs = seriesStartMs + ((seriesEndMs - seriesStartMs) * index) / 30;
    const state = rangeStateAtMs(first, second, atMs);
    return {
      atUtc: new Date(atMs).toISOString(),
      rangeKm: state ? Math.sqrt(state.rangeSquaredKm) : Number.NaN,
    };
  }).filter((sample) => Number.isFinite(sample.rangeKm));
}

function screenPairAcrossTime(
  firstRecord: SatelliteRecord,
  secondRecord: SatelliteRecord,
  first: SatellitePropagator,
  second: SatellitePropagator,
  options: Required<ScreeningOptions>,
): ConjunctionResult | null {
  const startMs = Date.parse(options.startUtc);
  const endMs = startMs + options.windowHours * HOURS_TO_MS;
  const stepMs = options.coarseStepSeconds * 1_000;
  const coarseRanges: Array<{ atMs: number; rangeKm: number }> = [];

  for (let atMs = startMs; atMs <= endMs; atMs += stepMs) {
    const state = rangeStateAtMs(first, second, atMs);
    if (state) {
      coarseRanges.push({ atMs, rangeKm: Math.sqrt(state.rangeSquaredKm) });
    }
  }
  if (coarseRanges.at(-1)?.atMs !== endMs) {
    const state = rangeStateAtMs(first, second, endMs);
    if (state) coarseRanges.push({ atMs: endMs, rangeKm: Math.sqrt(state.rangeSquaredKm) });
  }
  if (coarseRanges.length < 2) return null;

  const refinementLimitKm =
    options.thresholdKm +
    (MAX_LEO_RELATIVE_SPEED_KM_S * options.coarseStepSeconds) / 2;
  let best: { atMs: number; state: RangeState } | null = null;

  for (let index = 0; index < coarseRanges.length; index += 1) {
    const current = coarseRanges[index];
    const before = coarseRanges[index - 1]?.rangeKm ?? Number.POSITIVE_INFINITY;
    const after = coarseRanges[index + 1]?.rangeKm ?? Number.POSITIVE_INFINITY;
    if (
      current.rangeKm > before ||
      current.rangeKm > after ||
      current.rangeKm > refinementLimitKm
    ) {
      continue;
    }

    const refined = refineTimeOfClosestApproach(
      first,
      second,
      Math.max(startMs, current.atMs - stepMs),
      Math.min(endMs, current.atMs + stepMs),
    );
    if (
      refined &&
      (!best || refined.state.rangeSquaredKm < best.state.rangeSquaredKm)
    ) {
      best = refined;
    }
  }

  if (!best || Math.sqrt(best.state.rangeSquaredKm) > options.thresholdKm) return null;
  const oldestEpochMs = Math.min(
    elementEpochUtc(firstRecord).getTime(),
    elementEpochUtc(secondRecord).getTime(),
  );

  return {
    id: `${firstRecord.catalogNumber}-${secondRecord.catalogNumber}-${Math.round(best.atMs)}`,
    first: { name: firstRecord.name, catalogNumber: firstRecord.catalogNumber },
    second: { name: secondRecord.name, catalogNumber: secondRecord.catalogNumber },
    tcaUtc: new Date(best.atMs).toISOString(),
    missDistanceKm: Math.sqrt(best.state.rangeSquaredKm),
    relativeVelocityKmS: relativeVelocityKmS(best.state),
    oldestElementAgeHours: Math.max(0, (startMs - oldestEpochMs) / HOURS_TO_MS),
    rangeSeries: rangeSeries(first, second, best.atMs, startMs, endMs),
  };
}

export function screenSatelliteCatalog(
  catalog: SatelliteRecord[],
  requestedOptions: ScreeningOptions,
  onProgress?: (progress: ScreeningProgress) => void,
): ScreeningReport {
  const startedAtMs = performance.now();
  const options: Required<ScreeningOptions> = {
    ...requestedOptions,
    coarseStepSeconds: requestedOptions.coarseStepSeconds ?? 120,
  };
  const eligible = catalog
    .filter((record) => record.regime === "LEO")
    .sort(
      (first, second) =>
        elementEpochUtc(second).getTime() - elementEpochUtc(first).getTime(),
    );
  const records = eligible.slice(0, options.maxObjects);
  const geometries = records.map(orbitGeometry);
  const propagators = records.map(createSatellitePropagator);
  const initialPairs = pairCount(records.length);
  const apsisPairs: IndexedPair[] = [];
  let checkedPairs = 0;
  onProgress?.({ stage: "prepare", completed: records.length, total: records.length });

  for (let firstIndex = 0; firstIndex < records.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < records.length; secondIndex += 1) {
      if (
        apsisBandsOverlap(
          geometries[firstIndex],
          geometries[secondIndex],
          options.thresholdKm,
        )
      ) {
        apsisPairs.push({ firstIndex, secondIndex });
      }
      checkedPairs += 1;
      reportProgress(onProgress, "apsis", checkedPairs, initialPairs);
    }
  }

  const pathPairs: IndexedPair[] = [];
  for (let index = 0; index < apsisPairs.length; index += 1) {
    const pair = apsisPairs[index];
    const pathDistanceKm = minimumOrbitPathDistanceKm(
      geometries[pair.firstIndex],
      geometries[pair.secondIndex],
    );
    if (pathDistanceKm <= options.thresholdKm + PATH_GATE_NUMERICAL_MARGIN_KM) {
      pathPairs.push(pair);
    }
    reportProgress(onProgress, "path", index + 1, apsisPairs.length);
  }

  const results: ConjunctionResult[] = [];
  for (let index = 0; index < pathPairs.length; index += 1) {
    const pair = pathPairs[index];
    const result = screenPairAcrossTime(
      records[pair.firstIndex],
      records[pair.secondIndex],
      propagators[pair.firstIndex],
      propagators[pair.secondIndex],
      options,
    );
    if (result) results.push(result);
    reportProgress(onProgress, "propagate", index + 1, pathPairs.length);
  }

  results.sort((first, second) => first.missDistanceKm - second.missDistanceKm);
  return {
    options,
    stats: {
      catalogObjects: catalog.length,
      eligibleLeoObjects: eligible.length,
      screenedObjects: records.length,
      initialPairs,
      afterApsisPairs: apsisPairs.length,
      afterPathPairs: pathPairs.length,
      elapsedMs: performance.now() - startedAtMs,
    },
    results: results.slice(0, MAX_REPORTED_APPROACHES),
  };
}
