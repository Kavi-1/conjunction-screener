import assert from "node:assert/strict";
import test from "node:test";

import fixture from "../fixtures/satellites.json" with { type: "json" };
import type { TleRecord } from "../lib/propagate.ts";
import {
  apsisBandsOverlap,
  minimumOrbitPathDistanceKm,
  orbitGeometry,
} from "../lib/screen-geometry.ts";
import { screenSatelliteCatalog } from "../lib/screen.ts";

const records = fixture as TleRecord[];
const iss = records.find((record) => record.catalogNumber === "25544");
const station = records.find((record) => record.catalogNumber === "48274");
const gps = records.find((record) => record.catalogNumber === "26407");

assert.ok(iss && station && gps);

test("apsis gate rejects radially separated real orbits", () => {
  assert.equal(apsisBandsOverlap(orbitGeometry(iss), orbitGeometry(gps), 10), false);
  assert.equal(apsisBandsOverlap(orbitGeometry(iss), orbitGeometry(station), 200), true);
});

test("orbit-path distance is symmetric", () => {
  const first = orbitGeometry(iss);
  const second = orbitGeometry(station);
  const forwardKm = minimumOrbitPathDistanceKm(first, second);
  const reverseKm = minimumOrbitPathDistanceKm(second, first);

  assert.ok(Number.isFinite(forwardKm));
  assert.ok(Math.abs(forwardKm - reverseKm) < 0.1);
});

test("screening reports gate counts and a refined real-orbit approach", () => {
  const report = screenSatelliteCatalog([iss, station, gps], {
    startUtc: "2026-09-12T05:00:00.000Z",
    windowHours: 0.1,
    thresholdKm: 20_000,
    maxObjects: 3,
    coarseStepSeconds: 60,
  });

  assert.equal(report.stats.initialPairs, 1);
  assert.equal(report.stats.afterApsisPairs, 1);
  assert.equal(report.stats.afterPathPairs, 1);
  assert.equal(report.results.length, 1);
  assert.ok(report.results[0].missDistanceKm <= 20_000);
  assert.ok(report.results[0].rangeSeries.length > 2);
  assert.match(report.results[0].tcaUtc, /Z$/);
});
