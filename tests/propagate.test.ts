import assert from "node:assert/strict";
import test from "node:test";

import {
  altitudeAboveMeanEarthKm,
  propagateSatelliteAtUtc,
  tleEpochUtc,
  type OmmRecord,
} from "../lib/propagate.ts";

test("TLE epoch is parsed as UTC day-of-year", () => {
  const epoch = tleEpochUtc(
    "1 25544U 98067A   26255.20788499  .00004954  00000+0  97729-4 0  9996",
  );

  assert.equal(epoch.toISOString(), "2026-09-12T04:59:21.263Z");
});

test("altitude helper returns explicit kilometers", () => {
  assert.equal(altitudeAboveMeanEarthKm({ x: 6_771, y: 0, z: 0 }), 400);
});

test("normalized OMM elements propagate through the same position path", () => {
  const record: OmmRecord = {
    name: "ISS (ZARYA)",
    catalogNumber: "25544",
    internationalDesignator: "1998-067A",
    regime: "LEO",
    epochUtc: "2026-09-12T04:59:21.263Z",
    meanMotionRevDay: 15.4908657,
    eccentricity: 0.0004952,
    inclinationDeg: 51.6305,
    rightAscensionAscendingNodeDeg: 229.4056,
    argumentOfPericenterDeg: 131.3152,
    meanAnomalyDeg: 228.8264,
    elementSetNumber: 999,
    bstar: 0.000097729,
    meanMotionDot: 0.00004954,
    meanMotionDdot: 0,
  };

  const position = propagateSatelliteAtUtc(
    record,
    new Date("2026-09-12T05:04:21.263Z"),
  );

  assert.ok(position);
  assert.equal(position.catalogNumber, "25544");
  assert.ok(position.altitudeKm > 300 && position.altitudeKm < 500);
  assert.ok(position.velocityKmS > 7 && position.velocityKmS < 8);
});
