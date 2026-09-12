import { elementEpochUtc } from "./propagate.ts";
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
const MAX_LEO_RELATIVE_SPEED_KM_S = 20;

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

export function screenPairAcrossTime(
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
    if (state) coarseRanges.push({ atMs, rangeKm: Math.sqrt(state.rangeSquaredKm) });
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
    if (current.rangeKm > before || current.rangeKm > after || current.rangeKm > refinementLimitKm) continue;

    const refined = refineTimeOfClosestApproach(
      first,
      second,
      Math.max(startMs, current.atMs - stepMs),
      Math.min(endMs, current.atMs + stepMs),
    );
    if (refined && (!best || refined.state.rangeSquaredKm < best.state.rangeSquaredKm)) {
      best = refined;
    }
  }

  if (!best || Math.sqrt(best.state.rangeSquaredKm) > options.thresholdKm) return null;
  const oldestEpochMs = Math.min(
    elementEpochUtc(firstRecord).getTime(),
    elementEpochUtc(secondRecord).getTime(),
  );
  const relativeVelocityKmS = Math.hypot(
    best.state.first.velocityEciKmS.x - best.state.second.velocityEciKmS.x,
    best.state.first.velocityEciKmS.y - best.state.second.velocityEciKmS.y,
    best.state.first.velocityEciKmS.z - best.state.second.velocityEciKmS.z,
  );

  return {
    id: `${firstRecord.catalogNumber}-${secondRecord.catalogNumber}-${Math.round(best.atMs)}`,
    first: { name: firstRecord.name, catalogNumber: firstRecord.catalogNumber },
    second: { name: secondRecord.name, catalogNumber: secondRecord.catalogNumber },
    tcaUtc: new Date(best.atMs).toISOString(),
    missDistanceKm: Math.sqrt(best.state.rangeSquaredKm),
    relativeVelocityKmS,
    oldestElementAgeHours: Math.max(0, (startMs - oldestEpochMs) / HOURS_TO_MS),
    rangeSeries: rangeSeries(first, second, best.atMs, startMs, endMs),
  };
}
