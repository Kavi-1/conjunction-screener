import { elementEpochUtc } from "./propagate.ts";
import type { SatelliteRecord } from "./propagate.ts";
import {
  MAX_SCREEN_SPEED_KM_S,
  prepareScreeningTrajectory,
  screeningSampleTimesMs,
  radialTrajectoriesMayApproach,
  pathTrajectoriesMayApproach,
} from "./screen-trajectory.ts";
import { screenPairEncountersAcrossTime } from "./screen-temporal.ts";

export interface ScreeningOptions {
  startUtc: string;
  windowHours: number;
  thresholdKm: number;
  maxObjects: number;
  coarseStepSeconds?: number;
  /** Numerical search bracket width; not a bound on real-world prediction error. */
  refinementToleranceMs?: number;
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

export function screenSatelliteCatalog(
  catalog: SatelliteRecord[],
  requestedOptions: ScreeningOptions,
  onProgress?: (progress: ScreeningProgress) => void,
): ScreeningReport {
  const startedAtMs = performance.now();
  const options: Required<ScreeningOptions> = {
    ...requestedOptions,
    coarseStepSeconds: requestedOptions.coarseStepSeconds ?? 60,
    refinementToleranceMs: requestedOptions.refinementToleranceMs ?? 10,
  };
  if (!Number.isFinite(Date.parse(options.startUtc)) ||
      ![options.windowHours, options.thresholdKm, options.maxObjects, options.coarseStepSeconds, options.refinementToleranceMs].every(Number.isFinite) ||
      options.windowHours <= 0 || options.windowHours > 48 || options.thresholdKm <= 0 ||
      !Number.isInteger(options.maxObjects) || options.maxObjects < 2 || options.maxObjects > 500 ||
      options.coarseStepSeconds < 1 || options.coarseStepSeconds > 120 || options.refinementToleranceMs <= 0) {
    throw new Error("Invalid screening settings: use up to 48 hours, 2–500 objects, and a 1–120 second sampling step.");
  }
  const eligible = catalog
    .filter((record) => record.regime === "LEO")
    .sort(
      (first, second) =>
        elementEpochUtc(second).getTime() - elementEpochUtc(first).getTime(),
    );
  const records = eligible.slice(0, options.maxObjects);
  const startMs = Date.parse(options.startUtc);
  const timesMs = screeningSampleTimesMs(startMs, startMs + options.windowHours * 3_600_000, options.coarseStepSeconds * 1_000);
  const trajectories = records.map((record, index) => {
    const trajectory = prepareScreeningTrajectory(record, timesMs);
    onProgress?.({ stage: "prepare", completed: index + 1, total: records.length });
    return trajectory;
  });
  const searchRadiusKm = options.thresholdKm + MAX_SCREEN_SPEED_KM_S * options.coarseStepSeconds;
  const initialPairs = pairCount(records.length);
  const apsisPairs: IndexedPair[] = [];
  let checkedPairs = 0;
  onProgress?.({ stage: "prepare", completed: records.length, total: records.length });

  for (let firstIndex = 0; firstIndex < records.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < records.length; secondIndex += 1) {
      if (
        radialTrajectoriesMayApproach(
          trajectories[firstIndex],
          trajectories[secondIndex],
          searchRadiusKm,
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
    if (pathTrajectoriesMayApproach(trajectories[pair.firstIndex], trajectories[pair.secondIndex], searchRadiusKm)) {
      pathPairs.push(pair);
    }
    reportProgress(onProgress, "path", index + 1, apsisPairs.length);
  }

  const results: ConjunctionResult[] = [];
  for (let index = 0; index < pathPairs.length; index += 1) {
    const pair = pathPairs[index];
    const encounters = screenPairEncountersAcrossTime(
      records[pair.firstIndex],
      records[pair.secondIndex],
      trajectories[pair.firstIndex].propagate,
      trajectories[pair.secondIndex].propagate,
      options,
    );
    results.push(...encounters);
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
    results,
  };
}
