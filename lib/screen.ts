import { elementEpochUtc, createSatellitePropagator } from "./propagate.ts";
import type { SatelliteRecord } from "./propagate.ts";
import {
  apsisBandsOverlap,
  minimumOrbitPathDistanceKm,
  orbitGeometry,
} from "./screen-geometry.ts";
import { screenPairAcrossTime } from "./screen-temporal.ts";

const PATH_GATE_NUMERICAL_MARGIN_KM = 25;
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
