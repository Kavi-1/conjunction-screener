import assert from "node:assert/strict";
import test from "node:test";
import { propagateStateEciAtUtc, type TleRecord } from "../lib/propagate.ts";

import collisionFixture from "../fixtures/iridium-cosmos-2009.json" with {
  type: "json",
};
import {
  computeCollisionValidation,
  type CollisionReplayFixture,
} from "../lib/replay.ts";

test("pre-event elements closely reproduce the published SOCRATES prediction", () => {
  const validation = computeCollisionValidation(
    collisionFixture as CollisionReplayFixture,
  );

  // Celestrak publishes 16:55:59.806 UTC as the last SOCRATES prediction. Our
  // millisecond-resolution SGP4 minimum sits 10 ms earlier. Pinned, because a loose bound let an
  // artefact of the refinement tolerance read as exact agreement.
  assert.equal(validation.computedTcaUtc, "2009-02-10T16:55:59.796Z");
  assert.equal(validation.deltaSeconds.toFixed(3), "-0.010");
  assert.ok(Math.abs(validation.missDistanceKm - 0.698) < 0.002);
  assert.ok(Math.abs(validation.relativeVelocityKmS - 11.647) < 0.01);
  assert.equal(validation.referencePredictedTcaUtc, "2009-02-10T16:55:59.806Z");
  const [first, second] = (collisionFixture.satellites as TleRecord[]).map((r) => propagateStateEciAtUtc(r, new Date(validation.computedTcaUtc))!.positionEciKm);
  const rangeAtReportedTimeKm = Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
  assert.ok(Math.abs(rangeAtReportedTimeKm - validation.missDistanceKm) < 1e-9);
});
