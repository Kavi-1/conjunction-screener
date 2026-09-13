import type { SatellitePropagator, SatelliteRecord } from "./propagate.ts";
import { MAX_SCREEN_SPEED_KM_S } from "./screen-trajectory.ts";
import {
  ORBIT_PATH_GRID_SAMPLES,
  minimumOrbitPathDistanceKm,
  pathPointKm,
} from "./orbit-path-distance.ts";

export { minimumOrbitPathDistanceKm };

const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418;
const TWO_PI = Math.PI * 2;

export interface Vector3Km {
  x: number;
  y: number;
  z: number;
}

export interface OrbitGeometry {
  semiMajorAxisKm: number;
  eccentricity: number;
  perigeeRadiusKm: number;
  apogeeRadiusKm: number;
  basisP: Vector3Km;
  basisQ: Vector3Km;
  sampledPathKm: Vector3Km[];
}

interface MeanElements {
  meanMotionRevDay: number;
  eccentricity: number;
  inclinationDeg: number;
  rightAscensionAscendingNodeDeg: number;
  argumentOfPericenterDeg: number;
}

function meanElements(record: SatelliteRecord): MeanElements {
  if (!("line1" in record)) return record;

  return {
    inclinationDeg: Number.parseFloat(record.line2.slice(8, 16)),
    rightAscensionAscendingNodeDeg: Number.parseFloat(record.line2.slice(17, 25)),
    eccentricity: Number.parseFloat(`0.${record.line2.slice(26, 33).trim()}`),
    argumentOfPericenterDeg: Number.parseFloat(record.line2.slice(34, 42)),
    meanMotionRevDay: Number.parseFloat(record.line2.slice(52, 63)),
  };
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function orbitGeometry(record: SatelliteRecord): OrbitGeometry {
  const elements = meanElements(record);
  const meanMotionRadS = (elements.meanMotionRevDay * TWO_PI) / 86_400;
  const semiMajorAxisKm = Math.cbrt(
    EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 / meanMotionRadS ** 2,
  );
  const inclination = radians(elements.inclinationDeg);
  const ascendingNode = radians(elements.rightAscensionAscendingNodeDeg);
  const argumentOfPericenter = radians(elements.argumentOfPericenterDeg);
  const cosNode = Math.cos(ascendingNode);
  const sinNode = Math.sin(ascendingNode);
  const cosInclination = Math.cos(inclination);
  const sinInclination = Math.sin(inclination);
  const cosPericenter = Math.cos(argumentOfPericenter);
  const sinPericenter = Math.sin(argumentOfPericenter);
  const basisP = {
    x: cosNode * cosPericenter - sinNode * sinPericenter * cosInclination,
    y: sinNode * cosPericenter + cosNode * sinPericenter * cosInclination,
    z: sinPericenter * sinInclination,
  };
  const basisQ = {
    x: -cosNode * sinPericenter - sinNode * cosPericenter * cosInclination,
    y: -sinNode * sinPericenter + cosNode * cosPericenter * cosInclination,
    z: cosPericenter * sinInclination,
  };
  const geometry: OrbitGeometry = {
    semiMajorAxisKm,
    eccentricity: elements.eccentricity,
    perigeeRadiusKm: semiMajorAxisKm * (1 - elements.eccentricity),
    apogeeRadiusKm: semiMajorAxisKm * (1 + elements.eccentricity),
    basisP,
    basisQ,
    sampledPathKm: [],
  };
  geometry.sampledPathKm = Array.from({ length: ORBIT_PATH_GRID_SAMPLES }, (_, index) =>
    pathPointKm(geometry, (index * TWO_PI) / ORBIT_PATH_GRID_SAMPLES),
  );
  return geometry;
}

export interface RadialEnvelopeKm {
  minRadiusKm: number;
  maxRadiusKm: number;
}

/**
 * The radii SGP4 actually reaches across the screening window.
 *
 * Mean-element apsides are not a bound on the propagated trajectory: SGP4's
 * short-period terms carry the ISS about 6 km inside its mean perigee and
 * Iridium 33 about 12 km inside its own, so gating on a(1-e) and a(1+e)
 * discards pairs that do come within the threshold. Sampling the propagator
 * needs between-sample travel padding. This helper is retained for geometry
 * tests; production screening shares coarse states in screen-trajectory.ts.
 */
export function radialEnvelopeKm(
  propagate: SatellitePropagator,
  startUtc: string,
  windowHours: number,
  samplesPerOrbit = 90,
): RadialEnvelopeKm {
  const startMs = Date.parse(startUtc);
  const endMs = startMs + windowHours * 3_600_000;
  const first = propagate(new Date(startMs));
  if (!first) return { minRadiusKm: 0, maxRadiusKm: Number.POSITIVE_INFINITY };

  // Step from the object's own period so a low orbit and a high one are
  // resolved equally well.
  const stepMs = Math.max(
    1_000,
    (first.orbitalPeriodMinutes * 60_000) / samplesPerOrbit,
  );

  let minRadiusKm = Number.POSITIVE_INFINITY;
  let maxRadiusKm = 0;

  for (let sampleMs = startMs; sampleMs < endMs + stepMs; sampleMs += stepMs) {
    const atMs = Math.min(sampleMs, endMs);
    const state = propagate(new Date(atMs));
    if (!state) return { minRadiusKm: 0, maxRadiusKm: Infinity };
    const radiusKm = Math.hypot(
      state.positionEciKm.x,
      state.positionEciKm.y,
      state.positionEciKm.z,
    );
    minRadiusKm = Math.min(minRadiusKm, radiusKm);
    maxRadiusKm = Math.max(maxRadiusKm, radiusKm);
  }

  if (!Number.isFinite(minRadiusKm)) {
    return { minRadiusKm: 0, maxRadiusKm: Number.POSITIVE_INFINITY };
  }

  // A measured change is NOT a bound on an unseen extremum. Use the explicit
  // speed assumption and the maximum time to the nearest sample instead.
  const paddingKm = MAX_SCREEN_SPEED_KM_S * stepMs / 2_000;
  return {
    minRadiusKm: minRadiusKm - paddingKm,
    maxRadiusKm: maxRadiusKm + paddingKm,
  };
}

/** True when the two objects' propagated radial bands can come within the threshold. */
export function radialBandsOverlap(
  first: RadialEnvelopeKm,
  second: RadialEnvelopeKm,
  thresholdKm: number,
): boolean {
  return !(
    first.minRadiusKm - second.maxRadiusKm > thresholdKm ||
    second.minRadiusKm - first.maxRadiusKm > thresholdKm
  );
}
