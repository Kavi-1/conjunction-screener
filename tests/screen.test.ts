import assert from "node:assert/strict";
import test from "node:test";

import fixture from "../fixtures/satellites.json" with { type: "json" };
import regressionFixture from "../fixtures/screening-regressions.json" with { type: "json" };
import { normalizeGpCatalog } from "../lib/celestrak.ts";
import { screenPairEncountersAcrossTime } from "../lib/screen-temporal.ts";
import type { TleRecord } from "../lib/propagate.ts";
import { createSatellitePropagator } from "../lib/propagate.ts";
import {
  minimumOrbitPathDistanceKm,
  orbitGeometry,
  radialBandsOverlap,
  radialEnvelopeKm,
} from "../lib/screen-geometry.ts";
import { screenSatelliteCatalog } from "../lib/screen.ts";

const records = fixture as TleRecord[];
const iss = records.find((record) => record.catalogNumber === "25544");
const station = records.find((record) => record.catalogNumber === "48274");
const gps = records.find((record) => record.catalogNumber === "26407");

assert.ok(iss && station && gps);

const WINDOW = { startUtc: "2026-09-12T06:00:00.000Z", windowHours: 6 };
const envelope = (record: TleRecord) =>
  radialEnvelopeKm(
    createSatellitePropagator(record),
    WINDOW.startUtc,
    WINDOW.windowHours,
  );

test("radial gate rejects separated orbits and keeps overlapping ones", () => {
  assert.equal(radialBandsOverlap(envelope(iss), envelope(gps), 10), false);
  assert.equal(radialBandsOverlap(envelope(iss), envelope(station), 200), true);
});

test("the radial gate bounds SGP4, not the mean-element ellipse", () => {
  // SGP4's short-period terms carry objects outside a(1-e)..a(1+e), so gating
  // on the mean apsides discarded pairs that genuinely close to within 10 km.
  // At least one fixture object must show the mean model failing as a bound,
  // and the measured envelope must contain every radius the propagator visits.
  let sawMeanModelFail = false;

  for (const record of [iss, station, gps]) {
    const mean = orbitGeometry(record);
    const measured = envelope(record);
    if (
      measured.minRadiusKm < mean.perigeeRadiusKm - 1 ||
      measured.maxRadiusKm > mean.apogeeRadiusKm + 1
    ) {
      sawMeanModelFail = true;
    }

    const propagate = createSatellitePropagator(record);
    const startMs = Date.parse(WINDOW.startUtc);
    for (let s = 0; s <= WINDOW.windowHours * 3600; s += 17) {
      const state = propagate(new Date(startMs + s * 1000));
      if (!state) continue;
      const radiusKm = Math.hypot(
        state.positionEciKm.x,
        state.positionEciKm.y,
        state.positionEciKm.z,
      );
      assert.ok(
        radiusKm >= measured.minRadiusKm && radiusKm <= measured.maxRadiusKm,
        `${record.name}: radius ${radiusKm} escaped the envelope`,
      );
    }
  }

  assert.ok(sawMeanModelFail, "expected the mean apsides to fail as a bound");
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
  assert.ok(report.results.length >= 1);
  assert.ok(report.results[0].missDistanceKm <= 20_000);
  assert.ok(report.results[0].rangeSeries.length > 2);
  assert.match(report.results[0].tcaUtc, /Z$/);
});

test("real 10 km encounters survive both gates, including the old apsis false negatives", () => {
  const catalog = normalizeGpCatalog(regressionFixture.records).satellites;
  const options = { startUtc: "2026-09-12T12:00:00Z", windowHours: 24, thresholdKm: 10, maxObjects: 6, coarseStepSeconds: 60, refinementToleranceMs: 10 };
  const report = screenSatelliteCatalog(catalog, options);
  const gated = new Map(report.results.map((r) => [[r.first.catalogNumber, r.second.catalogNumber].sort().join("/"), r]));
  for (const pair of ["48149/67323", "100154/53084", "52457/68383"]) assert.ok(gated.has(pair), `${pair} was lost`);
  // The optimized screen must retain every encounter from an ungated run,
  // not just agree with another approximate geometric distance solver.
  for (let i = 0; i < catalog.length; i += 1) {
    for (let j = i + 1; j < catalog.length; j += 1) {
      const encounters = screenPairEncountersAcrossTime(catalog[i], catalog[j], createSatellitePropagator(catalog[i]), createSatellitePropagator(catalog[j]), options);
      const key = [catalog[i].catalogNumber, catalog[j].catalogNumber].sort().join("/");
      const reported = report.results.filter((r) => [r.first.catalogNumber, r.second.catalogNumber].sort().join("/") === key);
      assert.equal(reported.length, encounters.length, key);
      for (const encounter of encounters) assert.ok(reported.some((r) => Math.abs(Date.parse(r.tcaUtc) - Date.parse(encounter.tcaUtc)) <= 20));
    }
  }
});

test("repeat encounters and exact window endpoints are retained", () => {
  const options = { startUtc: "2026-09-12T05:00:00Z", windowHours: 24, thresholdKm: 20_000, maxObjects: 2, coarseStepSeconds: 60, refinementToleranceMs: 10 };
  const report = screenSatelliteCatalog([iss, station], options);
  assert.ok(report.results.length > 2);
  for (const result of report.results) assert.ok(result.rangeSeries.some((s) => s.atUtc === result.tcaUtc));
});

test("invalid screening settings fail rather than hang", () => {
  assert.throws(() => screenSatelliteCatalog([iss, station], { startUtc: "invalid", windowHours: 24, thresholdKm: 10, maxObjects: 2, coarseStepSeconds: 0 }), /Invalid screening settings/);
});
