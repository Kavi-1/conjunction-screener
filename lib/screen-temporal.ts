import { elementEpochUtc } from "./propagate.ts";
import { MAX_SCREEN_SPEED_KM_S } from "./screen-trajectory.ts";
import type {
  PropagationStateEci,
  SatellitePropagator,
  SatelliteRecord,
} from "./propagate.ts";
import type {
  ConjunctionResult,
  RangeSample,
  ScreeningOptions,
} from "./screen.ts";

const HOURS_TO_MS = 3_600_000;
const MAX_LEO_RELATIVE_SPEED_KM_S = 2 * MAX_SCREEN_SPEED_KM_S;

interface RangeState {
  rangeSquaredKm: number;
  first: PropagationStateEci;
  second: PropagationStateEci;
}

function rangeStateAtMs(
  first: SatellitePropagator,
  second: SatellitePropagator,
  atMs: number,
): RangeState | null {
  const atUtc = new Date(Math.round(atMs));
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
  toleranceMs: number,
): { atMs: number; state: RangeState } | null {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let leftMs = highMs - ratio * (highMs - lowMs);
  let rightMs = lowMs + ratio * (highMs - lowMs);
  let leftState = rangeStateAtMs(first, second, leftMs);
  let rightState = rangeStateAtMs(first, second, rightMs);
  if (!leftState || !rightState) return null;

  const endpoints = [lowMs, highMs].map((atMs) => ({ atMs, state: rangeStateAtMs(first, second, atMs) }));
  // Golden-section refinement assumes one minimum in the bracket. Retain
  // exact endpoints as well: an encounter can be closest at a window edge.
  while (highMs - lowMs > toleranceMs) {
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

  let best = leftState.rangeSquaredKm < rightState.rangeSquaredKm
    ? { atMs: leftMs, state: leftState }
    : { atMs: rightMs, state: rightState };
  for (const endpoint of endpoints) {
    if (endpoint.state && endpoint.state.rangeSquaredKm < best.state.rangeSquaredKm) best = { atMs: endpoint.atMs, state: endpoint.state };
  }
  return { atMs: Math.round(best.atMs), state: best.state };
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
  const timesMs = Array.from({ length: 31 }, (_, index) => Math.round(seriesStartMs + ((seriesEndMs - seriesStartMs) * index) / 30));
  timesMs.push(Math.round(tcaMs));
  return [...new Set(timesMs)].sort((a, b) => a - b).map((atMs) => {
    const state = rangeStateAtMs(first, second, atMs);
    return {
      atUtc: new Date(atMs).toISOString(),
      rangeKm: state ? Math.sqrt(state.rangeSquaredKm) : Number.NaN,
    };
  }).filter((sample) => Number.isFinite(sample.rangeKm));
}

export function screenPairEncountersAcrossTime(
  firstRecord: SatelliteRecord,
  secondRecord: SatelliteRecord,
  first: SatellitePropagator,
  second: SatellitePropagator,
  options: Required<ScreeningOptions>,
): ConjunctionResult[] {
  const startMs = Date.parse(options.startUtc);
  const endMs = startMs + options.windowHours * HOURS_TO_MS;
  const stepMs = options.coarseStepSeconds * 1_000;
  const coarseRanges: Array<{ atMs: number; rangeKm: number }> = [];

  for (let atMs = startMs; atMs <= endMs; atMs += stepMs) {
    const state = rangeStateAtMs(first, second, atMs);
    if (state) coarseRanges.push({ atMs, rangeKm: Math.sqrt(state.rangeSquaredKm) });
  }
  if (coarseRanges.at(-1)?.atMs !== endMs) {
    const state = rangeStateAtMs(first, second, endMs);
    if (state) coarseRanges.push({ atMs: endMs, rangeKm: Math.sqrt(state.rangeSquaredKm) });
  }
  if (coarseRanges.length < 2) return [];

  const refinementLimitKm =
    options.thresholdKm +
    (MAX_LEO_RELATIVE_SPEED_KM_S * options.coarseStepSeconds) / 2;
  const minima: Array<{ atMs: number; state: RangeState }> = [];

  for (let index = 0; index < coarseRanges.length; index += 1) {
    const current = coarseRanges[index];
    const before = coarseRanges[index - 1]?.rangeKm ?? Number.POSITIVE_INFINITY;
    const after = coarseRanges[index + 1]?.rangeKm ?? Number.POSITIVE_INFINITY;
    if (current.rangeKm > before || current.rangeKm > after || current.rangeKm > refinementLimitKm) continue;

    const refined = refineTimeOfClosestApproach(
      first,
      second,
      Math.max(startMs, current.atMs - stepMs),
      Math.min(endMs, current.atMs + stepMs),
      options.refinementToleranceMs,
    );
    if (refined && Math.sqrt(refined.state.rangeSquaredKm) <= options.thresholdKm) {
      const previous = minima.at(-1);
      // Adjacent coarse minima can converge on the same encounter.
      if (previous && Math.abs(previous.atMs - refined.atMs) <= Math.max(2, options.refinementToleranceMs * 2)) {
        if (refined.state.rangeSquaredKm < previous.state.rangeSquaredKm) minima[minima.length - 1] = refined;
      } else minima.push(refined);
    }
  }

  const oldestEpochMs = Math.min(
    elementEpochUtc(firstRecord).getTime(),
    elementEpochUtc(secondRecord).getTime(),
  );
  return minima.map((best) => {
    const relativeVelocityKmS = Math.hypot(
    best.state.first.velocityEciKmS.x - best.state.second.velocityEciKmS.x,
    best.state.first.velocityEciKmS.y - best.state.second.velocityEciKmS.y,
    best.state.first.velocityEciKmS.z - best.state.second.velocityEciKmS.z,
  );

  return {
    id: `${firstRecord.catalogNumber}-${secondRecord.catalogNumber}-${Math.round(best.atMs)}`,
    first: { name: firstRecord.name, catalogNumber: firstRecord.catalogNumber },
    second: { name: secondRecord.name, catalogNumber: secondRecord.catalogNumber },
    // Rounded, not truncated: the refined time is fractional and Date would
    // drop the remainder, costing a millisecond in the reported TCA.
    tcaUtc: new Date(Math.round(best.atMs)).toISOString(),
    missDistanceKm: Math.sqrt(best.state.rangeSquaredKm),
    relativeVelocityKmS,
    oldestElementAgeHours: (startMs - oldestEpochMs) / HOURS_TO_MS,
    rangeSeries: rangeSeries(first, second, best.atMs, startMs, endMs),
  };
  });
}

/** Single closest encounter, used by the historical replay. */
export function screenPairAcrossTime(
  ...args: Parameters<typeof screenPairEncountersAcrossTime>
): ConjunctionResult | null {
  return screenPairEncountersAcrossTime(...args).sort((a, b) => a.missDistanceKm - b.missDistanceKm)[0] ?? null;
}
