import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  radiansToDegrees,
} from "satellite.js";

import {
  propagateStateEciAtUtc,
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
}

export interface PassPredictionOptions {
  windowHours?: number;
  stepSeconds?: number;
  minimumElevationDeg?: number;
}

function elevationDegAtUtc(
  record: SatelliteRecord,
  observer: ObserverLocation,
  atUtc: Date,
): number {
  const state = propagateStateEciAtUtc(record, atUtc);
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
  record: SatelliteRecord,
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
      elevationDegAtUtc(record, observer, new Date(middleMs)) >= minimumElevationDeg;
    if (above === rising) highMs = middleMs;
    else lowMs = middleMs;
  }
  return new Date(highMs);
}

function refineMaximumUtc(
  record: SatelliteRecord,
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
    const leftElevation = elevationDegAtUtc(record, observer, new Date(leftMs));
    const rightElevation = elevationDegAtUtc(record, observer, new Date(rightMs));
    if (leftElevation < rightElevation) lowMs = leftMs;
    else highMs = rightMs;
  }

  const atUtc = new Date(Math.round((lowMs + highMs) / 2));
  return { atUtc, elevationDeg: elevationDegAtUtc(record, observer, atUtc) };
}

export function predictPassesUtc(
  record: SatelliteRecord,
  observer: ObserverLocation,
  windowStartUtc: Date,
  {
    windowHours = 24,
    stepSeconds = 60,
    minimumElevationDeg = 0,
  }: PassPredictionOptions = {},
): SatellitePass[] {
  const windowEndMs = windowStartUtc.getTime() + windowHours * 3_600_000;
  const stepMs = stepSeconds * 1_000;
  const passes: SatellitePass[] = [];
  let previousUtc = windowStartUtc;
  let previousElevation = elevationDegAtUtc(record, observer, previousUtc);
  let passStartUtc: Date | null =
    previousElevation >= minimumElevationDeg ? windowStartUtc : null;
  let coarseMaxUtc = windowStartUtc;
  let coarseMaxElevation = previousElevation;

  for (
    let atMs = windowStartUtc.getTime() + stepMs;
    atMs <= windowEndMs;
    atMs += stepMs
  ) {
    const atUtc = new Date(atMs);
    const elevationDeg = elevationDegAtUtc(record, observer, atUtc);

    if (!passStartUtc && previousElevation < minimumElevationDeg && elevationDeg >= minimumElevationDeg) {
      passStartUtc = refineCrossingUtc(
        record,
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

    if (passStartUtc && previousElevation >= minimumElevationDeg && elevationDeg < minimumElevationDeg) {
      const endUtc = refineCrossingUtc(
        record,
        observer,
        previousUtc,
        atUtc,
        minimumElevationDeg,
        false,
      );
      const maximum = refineMaximumUtc(
        record,
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
