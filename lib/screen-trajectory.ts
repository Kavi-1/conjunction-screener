import { createSatellitePropagator } from "./propagate.ts";
import type { PropagationStateEci, SatellitePropagator, SatelliteRecord } from "./propagate.ts";

// Bound-orbit LEO objects travel below Earth's ~11.2 km/s surface escape speed.
// Use 12 km/s per object. This is a physical screening assumption, not an
// uncertainty estimate for TLEs. Failed/out-of-scope propagation aborts the run.
export const MAX_SCREEN_SPEED_KM_S = 12;
const SAMPLES_PER_BLOCK = 4;

interface BoundsKm {
  min: number[];
  max: number[];
}

export interface ScreeningTrajectory {
  propagate: SatellitePropagator;
  minRadiusKm: number;
  maxRadiusKm: number;
  blocks: BoundsKm[];
}

export function screeningSampleTimesMs(startMs: number, endMs: number, stepMs: number): number[] {
  const times: number[] = [];
  for (let atMs = startMs; atMs < endMs; atMs += stepMs) times.push(atMs);
  times.push(endMs);
  return times;
}

export function prepareScreeningTrajectory(
  record: SatelliteRecord,
  timesMs: number[],
): ScreeningTrajectory {
  const propagate = createSatellitePropagator(record);
  const samples = new Map<number, PropagationStateEci>();
  const blocks: BoundsKm[] = [];
  let minRadiusKm = Infinity;
  let maxRadiusKm = 0;
  for (let index = 0; index < timesMs.length; index += 1) {
    const atMs = timesMs[index];
    const state = propagate(new Date(atMs));
    if (!state) throw new Error(`Cannot propagate ${record.name} across this window; try a shorter window or newer elements.`);
    const position = Object.values(state.positionEciKm);
    const velocity = Object.values(state.velocityEciKmS);
    const radiusKm = Math.hypot(...position);
    if (![...position, ...velocity].every(Number.isFinite) || radiusKm < 6_350 || Math.hypot(...velocity) > MAX_SCREEN_SPEED_KM_S) {
      throw new Error(`${record.name} is outside the supported bound-orbit screening model.`);
    }
    samples.set(atMs, state);
    minRadiusKm = Math.min(minRadiusKm, radiusKm);
    maxRadiusKm = Math.max(maxRadiusKm, radiusKm);
    const blockIndex = Math.floor(index / SAMPLES_PER_BLOCK);
    const block = blocks[blockIndex] ??= { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let axis = 0; axis < 3; axis += 1) {
      block.min[axis] = Math.min(block.min[axis], position[axis]);
      block.max[axis] = Math.max(block.max[axis], position[axis]);
    }
  }
  return {
    minRadiusKm,
    maxRadiusKm,
    blocks,
    // Coarse states are computed once per object, not once per pair. Only
    // refinement times require additional SGP4 calls.
    propagate: (atUtc) => samples.get(atUtc.getTime()) ?? propagate(atUtc),
  };
}

export function radialTrajectoriesMayApproach(first: ScreeningTrajectory, second: ScreeningTrajectory, searchRadiusKm: number): boolean {
  return Math.max(first.minRadiusKm - second.maxRadiusKm, second.minRadiusKm - first.maxRadiusKm) <= searchRadiusKm;
}

export function pathTrajectoriesMayApproach(first: ScreeningTrajectory, second: ScreeningTrajectory, searchRadiusKm: number): boolean {
  // Box distance is a LOWER bound on distances between sampled positions in
  // that time block. Unlike a locally minimized ellipse distance, it cannot
  // overestimate their minimum. The search radius includes between-sample
  // travel for BOTH objects (relative speed * half a time step).
  return first.blocks.some((block, index) => {
    const other = second.blocks[index];
    let distanceSquaredKm = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const gapKm = Math.max(0, block.min[axis] - other.max[axis], other.min[axis] - block.max[axis]);
      distanceSquaredKm += gapKm * gapKm;
    }
    return distanceSquaredKm <= searchRadiusKm ** 2;
  });
}
