import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
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
  const satrec = twoline2satrec(record.line1, record.line2);
  const propagated = propagate(satrec, atUtc);

  if (!propagated) {
    return null;
  }

  const geodetic = eciToGeodetic(propagated.position, gstime(atUtc));
  const velocityKmS = Math.hypot(
    propagated.velocity.x,
    propagated.velocity.y,
    propagated.velocity.z,
  );
  const altitudeKm = Math.max(0, geodetic.height);
  const elementEpochUtc = tleEpochUtc(record.line1);

  // True orbital altitude would put GEO points far outside a useful globe view.
  // A logarithmic display scale preserves ordering while keeping every regime visible.
  const displayAltitudeEarthRadii =
    0.025 + Math.log10(1 + altitudeKm / 300) * 0.11;

  return {
    ...record,
    latDeg: degreesLat(geodetic.latitude),
    lngDeg: degreesLong(geodetic.longitude),
    altitudeKm,
    displayAltitudeEarthRadii,
    velocityKmS,
    orbitalPeriodMinutes: TWO_PI / satrec.no,
    elementEpochUtc,
    elementAgeHours:
      (atUtc.getTime() - elementEpochUtc.getTime()) / 3_600_000,
  };
}

export function altitudeAboveMeanEarthKm(positionEciKm: {
  x: number;
  y: number;
  z: number;
}): number {
  return Math.hypot(positionEciKm.x, positionEciKm.y, positionEciKm.z) - EARTH_RADIUS_KM;
}
