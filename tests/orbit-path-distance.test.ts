import assert from "node:assert/strict";
import test from "node:test";

import satelliteFixture from "../fixtures/satellites.json" with { type: "json" };
import collisionFixture from "../fixtures/iridium-cosmos-2009.json" with { type: "json" };
import verificationFixture from "../fixtures/sgp4-verification.json" with { type: "json" };
import type { TleRecord } from "../lib/propagate.ts";
import { minimumOrbitPathDistanceKm, orbitGeometry } from "../lib/screen-geometry.ts";
import type { OrbitGeometry, Vector3Km } from "../lib/screen-geometry.ts";

/**
 * Exploratory fixed-ellipse solver only; NOT a production discard gate.
 * A dense-grid minimum is an upper bound, so agreement with it does not
 * certify the true minimum. Production gate regressions live in screen.test.ts.
 */

const TWO_PI = Math.PI * 2;
const BRUTE_FORCE_SAMPLES = 1_440;
const MAX_ALLOWED_OVERESTIMATE_KM = 0.5;

function pathPoint(geometry: OrbitGeometry, eccentricAnomalyRad: number): Vector3Km {
  const perifocalX =
    geometry.semiMajorAxisKm * (Math.cos(eccentricAnomalyRad) - geometry.eccentricity);
  const perifocalY =
    geometry.semiMajorAxisKm *
    Math.sqrt(1 - geometry.eccentricity ** 2) *
    Math.sin(eccentricAnomalyRad);
  return {
    x: geometry.basisP.x * perifocalX + geometry.basisQ.x * perifocalY,
    y: geometry.basisP.y * perifocalX + geometry.basisQ.y * perifocalY,
    z: geometry.basisP.z * perifocalX + geometry.basisQ.z * perifocalY,
  };
}

function bruteForceMinimumKm(first: OrbitGeometry, second: OrbitGeometry): number {
  let bestSquared = Number.POSITIVE_INFINITY;
  for (let i = 0; i < BRUTE_FORCE_SAMPLES; i += 1) {
    const p = pathPoint(first, (i * TWO_PI) / BRUTE_FORCE_SAMPLES);
    for (let j = 0; j < BRUTE_FORCE_SAMPLES; j += 1) {
      const q = pathPoint(second, (j * TWO_PI) / BRUTE_FORCE_SAMPLES);
      const squared = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
      if (squared < bestSquared) bestSquared = squared;
    }
  }
  return Math.sqrt(bestSquared);
}

function worstOverestimateKm(geometries: OrbitGeometry[]): {
  worstKm: number;
  discardedBelow100Km: number;
} {
  let worstKm = Number.NEGATIVE_INFINITY;
  let discardedBelow100Km = 0;
  for (let i = 0; i < geometries.length; i += 1) {
    for (let j = i + 1; j < geometries.length; j += 1) {
      const solved = minimumOrbitPathDistanceKm(geometries[i], geometries[j]);
      const reference = bruteForceMinimumKm(geometries[i], geometries[j]);
      worstKm = Math.max(worstKm, solved - reference);
      if (reference <= 100 && solved > 100 + MAX_ALLOWED_OVERESTIMATE_KM) {
        discardedBelow100Km += 1;
      }
    }
  }
  return { worstKm, discardedBelow100Km };
}

test("ellipse estimates agree with the sampled reference on archived real elements", () => {
  const records: TleRecord[] = [
    ...(satelliteFixture as TleRecord[]),
    ...(collisionFixture.satellites as TleRecord[]),
    ...verificationFixture.cases.map((verificationCase) => ({
      name: `verification ${verificationCase.catalogNumber}`,
      catalogNumber: verificationCase.catalogNumber,
      internationalDesignator: "verification",
      regime: "HEO" as const,
      line1: verificationCase.line1,
      line2: verificationCase.line2,
    })),
  ];

  const { worstKm, discardedBelow100Km } = worstOverestimateKm(records.map(orbitGeometry));
  assert.ok(
    worstKm < MAX_ALLOWED_OVERESTIMATE_KM,
    `worst difference from sampled reference ${worstKm.toFixed(4)} km`,
  );
  assert.equal(discardedBelow100Km, 0);
});

test("path distance is symmetric and finite", () => {
  const [first, second] = (satelliteFixture as TleRecord[]).map(orbitGeometry);
  const forwardKm = minimumOrbitPathDistanceKm(first, second);
  const reverseKm = minimumOrbitPathDistanceKm(second, first);
  assert.ok(Number.isFinite(forwardKm));
  assert.ok(Math.abs(forwardKm - reverseKm) < 1e-6);
});
