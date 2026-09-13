import type { ObserverLocation, SatellitePass } from "./passes.ts";
import type { SatelliteRecord } from "./propagate.ts";

export interface PassWorkerRequest {
  records: SatelliteRecord[];
  observer: ObserverLocation;
  startUtc: string;
}

export type PassWorkerResponse =
  | { type: "complete"; passes: SatellitePass[] }
  | { type: "error"; message: string };
