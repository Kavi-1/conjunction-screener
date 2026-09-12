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
