import assert from "node:assert/strict";
import test from "node:test";

import { altitudeAboveMeanEarthKm, tleEpochUtc } from "../lib/propagate.ts";

test("TLE epoch is parsed as UTC day-of-year", () => {
  const epoch = tleEpochUtc(
    "1 25544U 98067A   26255.20788499  .00004954  00000+0  97729-4 0  9996",
  );

  assert.equal(epoch.toISOString(), "2026-09-12T04:59:21.263Z");
});

test("altitude helper returns explicit kilometers", () => {
  assert.equal(altitudeAboveMeanEarthKm({ x: 6_771, y: 0, z: 0 }), 400);
});
