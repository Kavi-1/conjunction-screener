import { createSatellitePropagator } from "./propagate.ts";
import type { TleRecord } from "./propagate.ts";
import { screenPairAcrossTime } from "./screen-temporal.ts";

export interface CollisionReplayFixture {
  source: string;
  scenarioSource: string;
  referencePredictedTcaUtc: string;
  replayStartUtc: string;
  replayEndUtc: string;
  satellites: TleRecord[];
}

export interface CollisionValidation {
  computedTcaUtc: string;
  referencePredictedTcaUtc: string;
  deltaSeconds: number;
  missDistanceKm: number;
  relativeVelocityKmS: number;
}

export function computeCollisionValidation(
  fixture: CollisionReplayFixture,
): CollisionValidation {
  const [first, second] = fixture.satellites;
  if (!first || !second) throw new Error("Collision replay needs two satellites");
  const startMs = Date.parse(fixture.replayStartUtc);
  const endMs = Date.parse(fixture.replayEndUtc);
  const result = screenPairAcrossTime(
    first,
    second,
    createSatellitePropagator(first),
    createSatellitePropagator(second),
    {
      startUtc: fixture.replayStartUtc,
      windowHours: (endMs - startMs) / 3_600_000,
      thresholdKm: 100,
      maxObjects: 2,
      coarseStepSeconds: 10,
      // A narrow search bracket avoids rounding onto the reference by chance.
      // The Date-based propagator still has millisecond, not sub-ms resolution.
      refinementToleranceMs: 0.5,
    },
  );
  if (!result) throw new Error("Historical close approach was not reproduced");

  return {
    computedTcaUtc: result.tcaUtc,
    referencePredictedTcaUtc: fixture.referencePredictedTcaUtc,
    deltaSeconds:
      (Date.parse(result.tcaUtc) - Date.parse(fixture.referencePredictedTcaUtc)) / 1_000,
    missDistanceKm: result.missDistanceKm,
    relativeVelocityKmS: result.relativeVelocityKmS,
  };
}
