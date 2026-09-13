import { propagateSatelliteAtUtc, type SatelliteRecord } from "./propagate.ts";

/**
 * The path an object traces over the rotating Earth across one orbit. Drawn for
 * the selected object so its position reads as part of a trajectory rather than
 * as an isolated dot.
 */

const DEFAULT_SAMPLES = 180;
/** A track that crosses the antimeridian must be cut, or it is drawn the long way round. */
const ANTIMERIDIAN_JUMP_DEG = 180;

export interface GroundTrackPoint {
  latDeg: number;
  lngDeg: number;
  displayAltitudeEarthRadii: number;
}

export function groundTrackSegments(
  record: SatelliteRecord,
  fromUtc: Date,
  samples: number = DEFAULT_SAMPLES,
): GroundTrackPoint[][] {
  const first = propagateSatelliteAtUtc(record, fromUtc);
  if (!first) return [];

  const periodMs = first.orbitalPeriodMinutes * 60_000;
  if (!Number.isFinite(periodMs) || periodMs <= 0) return [];

  const segments: GroundTrackPoint[][] = [];
  let current: GroundTrackPoint[] = [];
  let previousLngDeg: number | null = null;

  for (let index = 0; index <= samples; index += 1) {
    const atUtc = new Date(fromUtc.getTime() + (periodMs * index) / samples);
    const position = propagateSatelliteAtUtc(record, atUtc);
    if (!position) continue;

    if (
      previousLngDeg !== null &&
      Math.abs(position.lngDeg - previousLngDeg) > ANTIMERIDIAN_JUMP_DEG
    ) {
      if (current.length > 1) segments.push(current);
      current = [];
    }

    current.push({
      latDeg: position.latDeg,
      lngDeg: position.lngDeg,
      displayAltitudeEarthRadii: position.displayAltitudeEarthRadii,
    });
    previousLngDeg = position.lngDeg;
  }

  if (current.length > 1) segments.push(current);
  return segments;
}
