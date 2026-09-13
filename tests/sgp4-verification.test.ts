import assert from "node:assert/strict";
import test from "node:test";
import { verifySgp4Subset } from "../lib/verification.ts";

import verificationFixture from "../fixtures/sgp4-verification.json" with {
  type: "json",
};
import {
  propagateStateEciAtUtc,
  tleEpochUtc,
  type TleRecord,
} from "../lib/propagate.ts";

// The app's millisecond Date timestamps truncate the fractional TLE epoch.
// At orbital speed that produces several metres of difference in this subset.
// Other official cases also require matching legacy/improved operation modes.
const MAX_ALLOWED_POSITION_ERROR_KM = 0.01;

test("propagation matches the declared three-case, nine-position Celestrak subset", () => {
  let maxPositionErrorKm = 0;

  for (const verificationCase of verificationFixture.cases) {
    const record: TleRecord = {
      name: `SGP4 verification ${verificationCase.catalogNumber}`,
      catalogNumber: verificationCase.catalogNumber,
      internationalDesignator: "verification",
      regime: "HEO",
      line1: verificationCase.line1,
      line2: verificationCase.line2,
    };
    const epochMs = tleEpochUtc(record.line1).getTime();

    for (const sample of verificationCase.samples) {
      const state = propagateStateEciAtUtc(
        record,
        new Date(epochMs + sample.offsetSeconds * 1_000),
      );
      assert.ok(state, `${verificationCase.catalogNumber} failed to propagate`);

      const [expectedXKm, expectedYKm, expectedZKm] = sample.positionTemeKm;
      const positionErrorKm = Math.hypot(
        state.positionEciKm.x - expectedXKm,
        state.positionEciKm.y - expectedYKm,
        state.positionEciKm.z - expectedZKm,
      );
      maxPositionErrorKm = Math.max(maxPositionErrorKm, positionErrorKm);
    }
  }

  assert.ok(
    maxPositionErrorKm < MAX_ALLOWED_POSITION_ERROR_KM,
    `maximum TEME position error ${maxPositionErrorKm.toFixed(9)} km`,
  );
  const displayed = verifySgp4Subset(verificationFixture);
  assert.equal(displayed.caseCount, 3);
  assert.equal(displayed.sampleCount, 9);
  assert.equal(displayed.maxPositionErrorKm, maxPositionErrorKm);
});
