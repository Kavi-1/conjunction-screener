import assert from "node:assert/strict";
import test from "node:test";

import collisionFixture from "../fixtures/iridium-cosmos-2009.json" with {
  type: "json",
};
import {
  computeCollisionValidation,
  type CollisionReplayFixture,
} from "../lib/replay.ts";

test("pre-event elements reproduce the documented 2009 collision time", () => {
  const validation = computeCollisionValidation(
    collisionFixture as CollisionReplayFixture,
  );

  assert.ok(Math.abs(validation.deltaSeconds) < 2);
  assert.ok(validation.missDistanceKm < 1);
  assert.ok(validation.relativeVelocityKmS > 11);
});
