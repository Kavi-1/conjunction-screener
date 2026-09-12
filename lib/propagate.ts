import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  twoline2satrec,
  type OMMJsonObject,
} from "satellite.js";

const EARTH_RADIUS_KM = 6_371;
const TWO_PI = Math.PI * 2;

export type OrbitRegime = "LEO" | "MEO" | "GEO" | "HEO";

export interface TleRecord {
  name: string;
  catalogNumber: string;
  internationalDesignator: string;
  regime: OrbitRegime;
  line1: string;
  line2: string;
}

export interface OmmRecord {
  name: string;
  catalogNumber: string;
  internationalDesignator: string;
  regime: OrbitRegime;
  epochUtc: string;
  meanMotionRevDay: number;
  eccentricity: number;
  inclinationDeg: number;
  rightAscensionAscendingNodeDeg: number;
  argumentOfPericenterDeg: number;
  meanAnomalyDeg: number;
  elementSetNumber: number;
  bstar: number;
  meanMotionDot: number;
  meanMotionDdot: number;
}

export type SatelliteRecord = TleRecord | OmmRecord;

export interface SatellitePosition {
  name: string;
  catalogNumber: string;
  internationalDesignator: string;
  regime: OrbitRegime;
  latDeg: number;
  lngDeg: number;
  altitudeKm: number;
  displayAltitudeEarthRadii: number;
  velocityKmS: number;
  orbitalPeriodMinutes: number;
  elementEpochUtc: Date;
  elementAgeHours: number;
}

export interface PropagationStateEci {
  positionEciKm: { x: number; y: number; z: number };
  velocityEciKmS: { x: number; y: number; z: number };
  orbitalPeriodMinutes: number;
}

export type SatellitePropagator = (atUtc: Date) => PropagationStateEci | null;

export function tleEpochUtc(line1: string): Date {
  const shortYear = Number.parseInt(line1.slice(18, 20), 10);
  const dayOfYear = Number.parseFloat(line1.slice(20, 32));

  if (!Number.isFinite(shortYear) || !Number.isFinite(dayOfYear)) {
    throw new Error("TLE has an invalid element epoch");
  }

  const fullYear = shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  return new Date(Date.UTC(fullYear, 0, 1) + (dayOfYear - 1) * 86_400_000);
}

export function propagateTleAtUtc(
  record: TleRecord,
  atUtc: Date,
): SatellitePosition | null {
  return propagateSatelliteAtUtc(record, atUtc);
}

export function elementEpochUtc(record: SatelliteRecord): Date {
  return "line1" in record ? tleEpochUtc(record.line1) : new Date(record.epochUtc);
}

export function propagateSatelliteAtUtc(
  record: SatelliteRecord,
  atUtc: Date,
): SatellitePosition | null {
  const state = propagateStateEciAtUtc(record, atUtc);
  if (!state) return null;

  const geodetic = eciToGeodetic(state.positionEciKm, gstime(atUtc));
  const velocityKmS = Math.hypot(
    state.velocityEciKmS.x,
    state.velocityEciKmS.y,
    state.velocityEciKmS.z,
  );
  const altitudeKm = Math.max(0, geodetic.height);
  const epochUtc = elementEpochUtc(record);

  // True orbital altitude would put GEO points far outside a useful globe view.
  // A logarithmic display scale preserves ordering while keeping every regime visible.
  const displayAltitudeEarthRadii =
    0.025 + Math.log10(1 + altitudeKm / 300) * 0.11;

  return {
    name: record.name,
    catalogNumber: record.catalogNumber,
    internationalDesignator: record.internationalDesignator,
    regime: record.regime,
    latDeg: degreesLat(geodetic.latitude),
    lngDeg: degreesLong(geodetic.longitude),
    altitudeKm,
    displayAltitudeEarthRadii,
    velocityKmS,
    orbitalPeriodMinutes: state.orbitalPeriodMinutes,
    elementEpochUtc: epochUtc,
    elementAgeHours:
      (atUtc.getTime() - epochUtc.getTime()) / 3_600_000,
  };
}

export function propagateStateEciAtUtc(
  record: SatelliteRecord,
  atUtc: Date,
): PropagationStateEci | null {
  const satrec =
    "line1" in record
      ? twoline2satrec(record.line1, record.line2)
      : json2satrec(toOmmJson(record));

  return propagateSatrecAtUtc(satrec, atUtc);
}

export function createSatellitePropagator(
  record: SatelliteRecord,
): SatellitePropagator {
  const satrec =
    "line1" in record
      ? twoline2satrec(record.line1, record.line2)
      : json2satrec(toOmmJson(record));

  return (atUtc) => propagateSatrecAtUtc(satrec, atUtc);
}

function propagateSatrecAtUtc(
  satrec: ReturnType<typeof twoline2satrec>,
  atUtc: Date,
): PropagationStateEci | null {
  const propagated = propagate(satrec, atUtc);

  if (!propagated) {
    return null;
  }

  return {
    positionEciKm: {
      x: propagated.position.x,
      y: propagated.position.y,
      z: propagated.position.z,
    },
    velocityEciKmS: {
      x: propagated.velocity.x,
      y: propagated.velocity.y,
      z: propagated.velocity.z,
    },
    orbitalPeriodMinutes: TWO_PI / satrec.no,
  };
}

function toOmmJson(record: OmmRecord): OMMJsonObject {
  return {
    OBJECT_NAME: record.name,
    OBJECT_ID: record.internationalDesignator,
    EPOCH: record.epochUtc,
    MEAN_MOTION: record.meanMotionRevDay,
    ECCENTRICITY: record.eccentricity,
    INCLINATION: record.inclinationDeg,
    RA_OF_ASC_NODE: record.rightAscensionAscendingNodeDeg,
    ARG_OF_PERICENTER: record.argumentOfPericenterDeg,
    MEAN_ANOMALY: record.meanAnomalyDeg,
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: record.catalogNumber,
    ELEMENT_SET_NO: record.elementSetNumber,
    BSTAR: record.bstar,
    MEAN_MOTION_DOT: record.meanMotionDot,
    MEAN_MOTION_DDOT: record.meanMotionDdot,
  };
}

export function altitudeAboveMeanEarthKm(positionEciKm: {
  x: number;
  y: number;
  z: number;
}): number {
  return Math.hypot(positionEciKm.x, positionEciKm.y, positionEciKm.z) - EARTH_RADIUS_KM;
}
