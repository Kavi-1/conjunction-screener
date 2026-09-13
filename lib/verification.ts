import { propagateStateEciAtUtc, tleEpochUtc } from "./propagate.ts";

interface VerificationFixture {
  cases: Array<{
    catalogNumber: string;
    line1: string;
    line2: string;
    samples: Array<{ offsetSeconds: number; positionTemeKm: number[] }>;
  }>;
}

/** Wiring check against a declared subset, not an orbit-accuracy estimate. */
export function verifySgp4Subset(fixture: VerificationFixture) {
  let maxPositionErrorKm = 0;
  let sampleCount = 0;
  for (const entry of fixture.cases) {
    const record = { ...entry, name: `Verification ${entry.catalogNumber}`, internationalDesignator: "Verification", regime: "HEO" as const };
    for (const sample of entry.samples) {
      const state = propagateStateEciAtUtc(record, new Date(tleEpochUtc(entry.line1).getTime() + sample.offsetSeconds * 1_000));
      if (!state) throw new Error(`Verification propagation failed for ${entry.catalogNumber}`);
      const [x, y, z] = sample.positionTemeKm;
      maxPositionErrorKm = Math.max(maxPositionErrorKm, Math.hypot(state.positionEciKm.x - x, state.positionEciKm.y - y, state.positionEciKm.z - z));
      sampleCount += 1;
    }
  }
  return { caseCount: fixture.cases.length, sampleCount, maxPositionErrorKm };
}
