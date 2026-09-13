import assert from "node:assert/strict";
import test from "node:test";

import fixture from "../fixtures/satellites.json" with { type: "json" };
import { groundTrackSegments } from "../lib/ground-track.ts";
import type { TleRecord } from "../lib/propagate.ts";
import { propagateSatelliteAtUtc } from "../lib/propagate.ts";

const iss = (fixture as TleRecord[]).find((record) => record.catalogNumber === "25544");
assert.ok(iss);

test("a ground track covers one orbit and stays on the globe", () => {
  const segments = groundTrackSegments(iss, new Date("2026-09-12T06:00:00.000Z"));
  const points = segments.flat();

  assert.ok(segments.length >= 1);
  assert.ok(points.length > 100);
  for (const point of points) {
    assert.ok(point.latDeg >= -90 && point.latDeg <= 90);
    assert.ok(point.lngDeg >= -180 && point.lngDeg <= 180);
    assert.ok(point.displayAltitudeEarthRadii > 0);
  }
  // The ISS reaches roughly its inclination in latitude over a full orbit.
  const maxLatDeg = Math.max(...points.map((point) => Math.abs(point.latDeg)));
  assert.ok(maxLatDeg > 45, `peak latitude was ${maxLatDeg.toFixed(1)} deg`);
});

test("a refreshed track starts at the newly propagated position", () => {
  const oldTrack = groundTrackSegments(iss, new Date("2026-09-12T06:00:00Z"));
  const refreshedAt = new Date("2026-09-12T06:00:30Z");
  const refreshed = groundTrackSegments(iss, refreshedAt);
  const expected = propagateSatelliteAtUtc(iss, refreshedAt);
  assert.ok(expected);
  assert.equal(refreshed[0][0].latDeg, expected.latDeg);
  assert.equal(refreshed[0][0].lngDeg, expected.lngDeg);
  assert.notEqual(refreshed[0][0].latDeg, oldTrack[0][0].latDeg);
});

test("the track is cut where it crosses the antimeridian", () => {
  const segments = groundTrackSegments(iss, new Date("2026-09-12T06:00:00.000Z"));

  for (const segment of segments) {
    for (let index = 1; index < segment.length; index += 1) {
      const stepDeg = Math.abs(segment[index].lngDeg - segment[index - 1].lngDeg);
      assert.ok(stepDeg <= 180, `segment jumps ${stepDeg.toFixed(1)} deg of longitude`);
    }
  }
});
