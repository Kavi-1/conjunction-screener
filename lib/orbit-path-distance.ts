import type { OrbitGeometry, Vector3Km } from "./screen-geometry.ts";

/**
 * Minimum distance between two orbit paths, ignoring where either object is in
 * time. Stage 3 of the screening pipeline in SPEC section 6.
 *
 * This feeds a discard gate, so an overestimate silently drops real
 * conjunctions and no one ever sees the pair. A sampled grid alone cannot carry
 * that responsibility: the squared-distance surface over the two eccentric
 * anomalies has several basins, and committing to the single best grid cell
 * lands in the wrong basin often enough to matter at a 10 km threshold. So
 * every grid-local minimum is refined to convergence with Newton steps on
 * analytic derivatives, and the best refined candidate wins.
 */

const GRID_SAMPLES = 32;
const MAX_REFINED_CANDIDATES = 6;
const MAX_NEWTON_ITERATIONS = 24;
const CONVERGENCE_RAD = 1e-9;
const TWO_PI = Math.PI * 2;

interface PathDerivatives {
  position: Vector3Km;
  velocity: Vector3Km;
  acceleration: Vector3Km;
}

function dot(first: Vector3Km, second: Vector3Km): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function semiMinorAxisKm(geometry: OrbitGeometry): number {
  return geometry.semiMajorAxisKm * Math.sqrt(1 - geometry.eccentricity ** 2);
}

/**
 * Position and its first two derivatives with respect to eccentric anomaly.
 * The perifocal parameterisation is r(E) = P a (cos E - e) + Q b sin E, so both
 * derivatives are exact rather than differenced.
 */
function pathDerivatives(
  geometry: OrbitGeometry,
  eccentricAnomalyRad: number,
): PathDerivatives {
  const a = geometry.semiMajorAxisKm;
  const b = semiMinorAxisKm(geometry);
  const cos = Math.cos(eccentricAnomalyRad);
  const sin = Math.sin(eccentricAnomalyRad);
  const { basisP: p, basisQ: q } = geometry;
  const perifocalX = a * (cos - geometry.eccentricity);
  const perifocalY = b * sin;
  const velocityX = -a * sin;
  const velocityY = b * cos;
  const accelerationX = -a * cos;
  const accelerationY = -b * sin;

  return {
    position: {
      x: p.x * perifocalX + q.x * perifocalY,
      y: p.y * perifocalX + q.y * perifocalY,
      z: p.z * perifocalX + q.z * perifocalY,
    },
    velocity: {
      x: p.x * velocityX + q.x * velocityY,
      y: p.y * velocityX + q.y * velocityY,
      z: p.z * velocityX + q.z * velocityY,
    },
    acceleration: {
      x: p.x * accelerationX + q.x * accelerationY,
      y: p.y * accelerationX + q.y * accelerationY,
      z: p.z * accelerationX + q.z * accelerationY,
    },
  };
}

export function pathPointKm(
  geometry: OrbitGeometry,
  eccentricAnomalyRad: number,
): Vector3Km {
  return pathDerivatives(geometry, eccentricAnomalyRad).position;
}

function squaredDistanceKm2(first: Vector3Km, second: Vector3Km): number {
  return (
    (first.x - second.x) ** 2 +
    (first.y - second.y) ** 2 +
    (first.z - second.z) ** 2
  );
}

/**
 * Refines one basin of the squared-distance surface. Newton converges
 * quadratically where the surface is convex; elsewhere it falls back to a
 * backtracking gradient step so a saddle cannot strand the search.
 */
function refineBasinKm2(
  first: OrbitGeometry,
  second: OrbitGeometry,
  startFirstRad: number,
  startSecondRad: number,
): number {
  let firstRad = startFirstRad;
  let secondRad = startSecondRad;
  let firstState = pathDerivatives(first, firstRad);
  let secondState = pathDerivatives(second, secondRad);
  let value = squaredDistanceKm2(firstState.position, secondState.position);

  for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS; iteration += 1) {
    const separation = {
      x: firstState.position.x - secondState.position.x,
      y: firstState.position.y - secondState.position.y,
      z: firstState.position.z - secondState.position.z,
    };
    const gradientFirst = 2 * dot(separation, firstState.velocity);
    const gradientSecond = -2 * dot(separation, secondState.velocity);
    const hessianFF =
      2 * (dot(firstState.velocity, firstState.velocity) + dot(separation, firstState.acceleration));
    const hessianSS =
      2 * (dot(secondState.velocity, secondState.velocity) - dot(separation, secondState.acceleration));
    const hessianFS = -2 * dot(firstState.velocity, secondState.velocity);
    const determinant = hessianFF * hessianSS - hessianFS * hessianFS;

    let stepFirst: number;
    let stepSecond: number;
    if (determinant > 0 && hessianFF > 0) {
      stepFirst = -(hessianSS * gradientFirst - hessianFS * gradientSecond) / determinant;
      stepSecond = -(hessianFF * gradientSecond - hessianFS * gradientFirst) / determinant;
    } else {
      // Saddle or flat curvature: descend, scaled so the first try is a
      // fraction of a grid cell rather than an unbounded leap.
      const gradientNorm = Math.hypot(gradientFirst, gradientSecond) || 1;
      const scale = (TWO_PI / GRID_SAMPLES) / gradientNorm;
      stepFirst = -gradientFirst * scale;
      stepSecond = -gradientSecond * scale;
    }

    let damping = 1;
    let accepted = false;
    for (let backtrack = 0; backtrack < 12; backtrack += 1) {
      const trialFirstRad = firstRad + stepFirst * damping;
      const trialSecondRad = secondRad + stepSecond * damping;
      const trialFirst = pathDerivatives(first, trialFirstRad);
      const trialSecond = pathDerivatives(second, trialSecondRad);
      const trialValue = squaredDistanceKm2(trialFirst.position, trialSecond.position);
      if (trialValue <= value) {
        const movedRad = Math.abs(stepFirst * damping) + Math.abs(stepSecond * damping);
        firstRad = trialFirstRad;
        secondRad = trialSecondRad;
        firstState = trialFirst;
        secondState = trialSecond;
        value = trialValue;
        accepted = true;
        if (movedRad < CONVERGENCE_RAD) return value;
        break;
      }
      damping /= 2;
    }
    if (!accepted) return value;
  }

  return value;
}

export function minimumOrbitPathDistanceKm(
  first: OrbitGeometry,
  second: OrbitGeometry,
): number {
  const firstPath = first.sampledPathKm;
  const secondPath = second.sampledPathKm;
  const grid = new Float64Array(GRID_SAMPLES * GRID_SAMPLES);

  for (let firstIndex = 0; firstIndex < GRID_SAMPLES; firstIndex += 1) {
    const firstPoint = firstPath[firstIndex];
    for (let secondIndex = 0; secondIndex < GRID_SAMPLES; secondIndex += 1) {
      grid[firstIndex * GRID_SAMPLES + secondIndex] = squaredDistanceKm2(
        firstPoint,
        secondPath[secondIndex],
      );
    }
  }

  // Every cell that is no greater than its eight torus neighbours starts a
  // candidate basin. Taking only the global minimum here is what lost real
  // conjunctions: the deepest basin on a coarse grid is often not the deepest
  // basin of the true surface.
  const candidates: Array<{ value: number; firstIndex: number; secondIndex: number }> = [];
  for (let firstIndex = 0; firstIndex < GRID_SAMPLES; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < GRID_SAMPLES; secondIndex += 1) {
      const value = grid[firstIndex * GRID_SAMPLES + secondIndex];
      let isLocalMinimum = true;
      for (let firstOffset = -1; firstOffset <= 1 && isLocalMinimum; firstOffset += 1) {
        for (let secondOffset = -1; secondOffset <= 1; secondOffset += 1) {
          if (firstOffset === 0 && secondOffset === 0) continue;
          const neighbourFirst = (firstIndex + firstOffset + GRID_SAMPLES) % GRID_SAMPLES;
          const neighbourSecond = (secondIndex + secondOffset + GRID_SAMPLES) % GRID_SAMPLES;
          if (grid[neighbourFirst * GRID_SAMPLES + neighbourSecond] < value) {
            isLocalMinimum = false;
            break;
          }
        }
      }
      if (isLocalMinimum) candidates.push({ value, firstIndex, secondIndex });
    }
  }

  candidates.sort((left, right) => left.value - right.value);
  let bestSquaredKm2 = Number.POSITIVE_INFINITY;
  const refinedCount = Math.min(candidates.length, MAX_REFINED_CANDIDATES);
  for (let index = 0; index < refinedCount; index += 1) {
    const candidate = candidates[index];
    const refined = refineBasinKm2(
      first,
      second,
      (candidate.firstIndex * TWO_PI) / GRID_SAMPLES,
      (candidate.secondIndex * TWO_PI) / GRID_SAMPLES,
    );
    if (refined < bestSquaredKm2) bestSquaredKm2 = refined;
  }

  return Math.sqrt(bestSquaredKm2);
}

export const ORBIT_PATH_GRID_SAMPLES = GRID_SAMPLES;
