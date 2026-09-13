import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  radiansToDegrees,
} from "satellite.js";

import {
  createSatellitePropagator,
  elementEpochUtc,
  type SatellitePropagator,
  type SatelliteRecord,
} from "./propagate.ts";

export interface ObserverLocation {
  latitudeDeg: number;
  longitudeDeg: number;
  heightKm: number;
  label: string;
}

export interface SatellitePass {
  objectName: string;
  catalogNumber: string;
  startUtc: Date;
  endUtc: Date;
  maxElevationDeg: number;
  maxElevationAtUtc: Date;
  durationSeconds: number;
  elementAgeHours: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface PassPredictionOptions {
  windowHours?: number;
  stepSeconds?: number;
  minimumElevationDeg?: number;
}

function elevationDegAtUtc(
  propagate: SatellitePropagator,
  observer: ObserverLocation,
  atUtc: Date,
): number {
  const state = propagate(atUtc);
  if (!state) return -90;

  const positionEcfKm = eciToEcf(state.positionEciKm, gstime(atUtc));
  const lookAngles = ecfToLookAngles(
    {
      latitude: degreesToRadians(observer.latitudeDeg),
      longitude: degreesToRadians(observer.longitudeDeg),
      height: observer.heightKm,
    },
    positionEcfKm,
  );
  return radiansToDegrees(lookAngles.elevation);
}

function refineCrossingUtc(
  propagate: SatellitePropagator,
  observer: ObserverLocation,
  beforeUtc: Date,
  afterUtc: Date,
  minimumElevationDeg: number,
  rising: boolean,
): Date {
  let lowMs = beforeUtc.getTime();
  let highMs = afterUtc.getTime();

  while (highMs - lowMs > 1_000) {
    const middleMs = Math.floor((lowMs + highMs) / 2);
    const above =
      elevationDegAtUtc(propagate, observer, new Date(middleMs)) >= minimumElevationDeg;
    if (above === rising) highMs = middleMs;
    else lowMs = middleMs;
  }
  return new Date(highMs);
}

function refineMaximumUtc(
  propagate: SatellitePropagator,
  observer: ObserverLocation,
  coarseMaxUtc: Date,
  startUtc: Date,
  endUtc: Date,
  stepSeconds: number,
): { atUtc: Date; elevationDeg: number } {
  let lowMs = Math.max(
    startUtc.getTime(),
    coarseMaxUtc.getTime() - stepSeconds * 1_000,
  );
  let highMs = Math.min(
    endUtc.getTime(),
    coarseMaxUtc.getTime() + stepSeconds * 1_000,
  );

  for (let iteration = 0; iteration < 18; iteration += 1) {
    const third = (highMs - lowMs) / 3;
    const leftMs = lowMs + third;
    const rightMs = highMs - third;
    const leftElevation = elevationDegAtUtc(propagate, observer, new Date(leftMs));
    const rightElevation = elevationDegAtUtc(propagate, observer, new Date(rightMs));
    if (leftElevation < rightElevation) lowMs = leftMs;
    else highMs = rightMs;
  }

  return [startUtc, endUtc, new Date(Math.round((lowMs + highMs) / 2))]
    .map((atUtc) => ({ atUtc, elevationDeg: elevationDegAtUtc(propagate, observer, atUtc) }))
    .sort((a, b) => b.elevationDeg - a.elevationDeg)[0];
}

export function predictPassesUtc(
  record: SatelliteRecord,
  observer: ObserverLocation,
  windowStartUtc: Date,
  {
    windowHours = 24,
    stepSeconds = 30,
    minimumElevationDeg = 0,
  }: PassPredictionOptions = {},
): SatellitePass[] {
  if (![windowStartUtc.getTime(), windowHours, stepSeconds, minimumElevationDeg, observer.latitudeDeg, observer.longitudeDeg, observer.heightKm].every(Number.isFinite) ||
      windowHours <= 0 || windowHours > 48 || stepSeconds < 1 || stepSeconds > 60 ||
      Math.abs(observer.latitudeDeg) > 90 || Math.abs(observer.longitudeDeg) > 180 || minimumElevationDeg < 0 || minimumElevationDeg >= 90) throw new Error("Invalid pass prediction settings");
  const propagate = createSatellitePropagator(record);
  const windowEndMs = windowStartUtc.getTime() + windowHours * 3_600_000;
  const stepMs = stepSeconds * 1_000;
  const passes: SatellitePass[] = [];
  let previousUtc = windowStartUtc;
  let previousElevation = elevationDegAtUtc(propagate, observer, previousUtc);
  let passStartUtc: Date | null =
    previousElevation >= minimumElevationDeg ? windowStartUtc : null;
  let coarseMaxUtc = windowStartUtc;
  let coarseMaxElevation = previousElevation;

  for (
    let sampleMs = windowStartUtc.getTime() + stepMs;
    sampleMs < windowEndMs + stepMs;
    sampleMs += stepMs
  ) {
    const atMs = Math.min(sampleMs, windowEndMs);
    const atUtc = new Date(atMs);
    const elevationDeg = elevationDegAtUtc(propagate, observer, atUtc);

    if (!passStartUtc && previousElevation < minimumElevationDeg && elevationDeg >= minimumElevationDeg) {
      passStartUtc = refineCrossingUtc(
        propagate,
        observer,
        previousUtc,
        atUtc,
        minimumElevationDeg,
        true,
      );
      coarseMaxUtc = atUtc;
      coarseMaxElevation = elevationDeg;
    }

    if (passStartUtc && elevationDeg > coarseMaxElevation) {
      coarseMaxUtc = atUtc;
      coarseMaxElevation = elevationDeg;
    }

    const setting = previousElevation >= minimumElevationDeg && elevationDeg < minimumElevationDeg;
    if (passStartUtc && (setting || atMs === windowEndMs)) {
      const endUtc = setting ? refineCrossingUtc(
        propagate,
        observer,
        previousUtc,
        atUtc,
        minimumElevationDeg,
        false,
      ) : atUtc;
      const maximum = refineMaximumUtc(
        propagate,
        observer,
        coarseMaxUtc,
        passStartUtc,
        endUtc,
        stepSeconds,
      );
      passes.push({
        objectName: record.name,
        catalogNumber: record.catalogNumber,
        startUtc: passStartUtc,
        endUtc,
        maxElevationDeg: maximum.elevationDeg,
        maxElevationAtUtc: maximum.atUtc,
        durationSeconds: (endUtc.getTime() - passStartUtc.getTime()) / 1_000,
        elementAgeHours: (windowStartUtc.getTime() - elementEpochUtc(record).getTime()) / 3_600_000,
        clippedStart: passStartUtc.getTime() === windowStartUtc.getTime(),
        clippedEnd: !setting,
      });
      passStartUtc = null;
      coarseMaxElevation = -90;
    }

    previousUtc = atUtc;
    previousElevation = elevationDeg;
  }

  return passes;
}

export function predictUpcomingPassesUtc(
  records: SatelliteRecord[],
  observer: ObserverLocation,
  windowStartUtc: Date,
  limit = 5,
): SatellitePass[] {
  return records
    .flatMap((record) => predictPassesUtc(record, observer, windowStartUtc))
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime())
    .slice(0, limit);
}
