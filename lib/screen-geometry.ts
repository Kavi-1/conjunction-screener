import type { SatelliteRecord } from "./propagate.ts";

const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418;
const TWO_PI = Math.PI * 2;
const PATH_SAMPLES = 18;

interface Vector3Km {
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
  geometry.sampledPathKm = Array.from({ length: PATH_SAMPLES }, (_, index) =>
    pathPointKm(geometry, (index * TWO_PI) / PATH_SAMPLES),
  );
  return geometry;
}

export function apsisBandsOverlap(
  first: OrbitGeometry,
  second: OrbitGeometry,
  thresholdKm: number,
): boolean {
  return !(
    first.perigeeRadiusKm - second.apogeeRadiusKm > thresholdKm ||
    second.perigeeRadiusKm - first.apogeeRadiusKm > thresholdKm
  );
}

function pathPointKm(geometry: OrbitGeometry, eccentricAnomalyRad: number): Vector3Km {
  const xPerifocalKm =
    geometry.semiMajorAxisKm *
    (Math.cos(eccentricAnomalyRad) - geometry.eccentricity);
  const yPerifocalKm =
    geometry.semiMajorAxisKm *
    Math.sqrt(1 - geometry.eccentricity ** 2) *
    Math.sin(eccentricAnomalyRad);
  return {
    x: geometry.basisP.x * xPerifocalKm + geometry.basisQ.x * yPerifocalKm,
    y: geometry.basisP.y * xPerifocalKm + geometry.basisQ.y * yPerifocalKm,
    z: geometry.basisP.z * xPerifocalKm + geometry.basisQ.z * yPerifocalKm,
  };
}

function squaredDistance(first: Vector3Km, second: Vector3Km): number {
  return (
    (first.x - second.x) ** 2 +
    (first.y - second.y) ** 2 +
    (first.z - second.z) ** 2
  );
}

function goldenMinimum(
  evaluate: (angleRad: number) => number,
  centerRad: number,
): { angleRad: number; value: number } {
  const halfSampleRad = Math.PI / PATH_SAMPLES;
  let low = centerRad - halfSampleRad;
  let high = centerRad + halfSampleRad;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = high - ratio * (high - low);
  let right = low + ratio * (high - low);
  let leftValue = evaluate(left);
  let rightValue = evaluate(right);

  for (let iteration = 0; iteration < 18; iteration += 1) {
    if (leftValue < rightValue) {
      high = right;
      right = left;
      rightValue = leftValue;
      left = high - ratio * (high - low);
      leftValue = evaluate(left);
    } else {
      low = left;
      left = right;
      leftValue = rightValue;
      right = low + ratio * (high - low);
      rightValue = evaluate(right);
    }
  }

  return leftValue < rightValue
    ? { angleRad: left, value: leftValue }
    : { angleRad: right, value: rightValue };
}

// A sampled global search followed by alternating local minimization gives a
// practical geometric path gate without pretending to be an analytical MOID.
export function minimumOrbitPathDistanceKm(
  first: OrbitGeometry,
  second: OrbitGeometry,
): number {
  let bestSquaredKm = Number.POSITIVE_INFINITY;
  let firstAngleRad = 0;
  let secondAngleRad = 0;

  for (let firstIndex = 0; firstIndex < PATH_SAMPLES; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < PATH_SAMPLES; secondIndex += 1) {
      const candidate = squaredDistance(
        first.sampledPathKm[firstIndex],
        second.sampledPathKm[secondIndex],
      );
      if (candidate < bestSquaredKm) {
        bestSquaredKm = candidate;
        firstAngleRad = (firstIndex * TWO_PI) / PATH_SAMPLES;
        secondAngleRad = (secondIndex * TWO_PI) / PATH_SAMPLES;
      }
    }
  }

  const sampledFirstAngleRad = firstAngleRad;
  const sampledSecondAngleRad = secondAngleRad;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const fixedSecond = pathPointKm(second, secondAngleRad);
    const firstMinimum = goldenMinimum(
      (angleRad) => squaredDistance(pathPointKm(first, angleRad), fixedSecond),
      firstAngleRad,
    );
    firstAngleRad = firstMinimum.angleRad;

    const fixedFirst = pathPointKm(first, firstAngleRad);
    const secondMinimum = goldenMinimum(
      (angleRad) => squaredDistance(fixedFirst, pathPointKm(second, angleRad)),
      secondAngleRad,
    );
    secondAngleRad = secondMinimum.angleRad;
    bestSquaredKm = secondMinimum.value;
  }

  let reverseFirstAngleRad = sampledFirstAngleRad;
  let reverseSecondAngleRad = sampledSecondAngleRad;
  let reverseBestSquaredKm = bestSquaredKm;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const fixedFirst = pathPointKm(first, reverseFirstAngleRad);
    const secondMinimum = goldenMinimum(
      (angleRad) => squaredDistance(fixedFirst, pathPointKm(second, angleRad)),
      reverseSecondAngleRad,
    );
    reverseSecondAngleRad = secondMinimum.angleRad;

    const fixedSecond = pathPointKm(second, reverseSecondAngleRad);
    const firstMinimum = goldenMinimum(
      (angleRad) => squaredDistance(pathPointKm(first, angleRad), fixedSecond),
      reverseFirstAngleRad,
    );
    reverseFirstAngleRad = firstMinimum.angleRad;
    reverseBestSquaredKm = firstMinimum.value;
  }

  return Math.sqrt(Math.min(bestSquaredKm, reverseBestSquaredKm));
}
