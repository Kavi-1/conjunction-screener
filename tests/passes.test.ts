import assert from "node:assert/strict";
import test from "node:test";

import fixture from "../fixtures/satellites.json" with { type: "json" };
import { findCityLocation } from "../lib/cities.ts";
import { predictPassesUtc } from "../lib/passes.ts";
import type { TleRecord } from "../lib/propagate.ts";

const iss = fixture.find((record) => record.catalogNumber === "25544") as TleRecord;

test("offline city lookup is case-insensitive", () => {
  assert.equal(findCityLocation("  new YORK ")?.latitudeDeg, 40.7128);
  assert.equal(findCityLocation("not a configured city"), null);
});

test("passes at both window boundaries are retained and marked partial", () => {
  const observer = findCityLocation("New York");
  assert.ok(observer);
  const [full] = predictPassesUtc(iss, observer, new Date("2026-09-12T05:00:00Z"));
  const windowStart = new Date(full.startUtc.getTime() - 60_000);
  const [endingOutside] = predictPassesUtc(iss, observer, windowStart, { windowHours: 0.05 });
  assert.ok(endingOutside);
  assert.equal(endingOutside.clippedEnd, true);
  assert.equal(endingOutside.endUtc.getTime(), windowStart.getTime() + 180_000);
  assert.equal(endingOutside.clippedStart, false);
  assert.ok(Number.isFinite(endingOutside.elementAgeHours));

  const middle = new Date(full.startUtc.getTime() + 120_000);
  const [both] = predictPassesUtc(iss, observer, middle, { windowHours: 0.01 });
  assert.ok(both);
  assert.equal(both.clippedStart, true);
  assert.equal(both.clippedEnd, true);
  assert.equal(both.durationSeconds, 36);
});

test("coarse pass timing agrees with a one-second scan on a real ISS pass", () => {
  const observer = findCityLocation("New York");
  assert.ok(observer);
  const start = new Date("2026-09-12T05:00:00Z");
  const [coarse] = predictPassesUtc(iss, observer, start, { windowHours: 1, stepSeconds: 30 });
  const [dense] = predictPassesUtc(iss, observer, start, { windowHours: 1, stepSeconds: 1 });
  assert.ok(Math.abs(coarse.startUtc.getTime() - dense.startUtc.getTime()) <= 1_000);
  assert.ok(Math.abs(coarse.maxElevationDeg - dense.maxElevationDeg) < 0.001);
});

test("pass prediction returns ordered UTC horizon crossings", () => {
  const observer = findCityLocation("New York");
  assert.ok(observer);

  const passes = predictPassesUtc(
    iss,
    observer,
    new Date("2026-09-12T05:00:00Z"),
    { windowHours: 24, stepSeconds: 60 },
  );

  assert.ok(passes.length > 0);
  for (const pass of passes) {
    assert.ok(pass.startUtc < pass.maxElevationAtUtc);
    assert.ok(pass.maxElevationAtUtc < pass.endUtc);
    assert.ok(pass.durationSeconds > 0);
    assert.ok(pass.maxElevationDeg > 0 && pass.maxElevationDeg <= 90);
  }
});
