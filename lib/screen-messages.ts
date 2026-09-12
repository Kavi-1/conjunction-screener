import type { SatelliteRecord } from "./propagate";
import type {
  ScreeningOptions,
  ScreeningProgress,
  ScreeningReport,
} from "./screen";

export interface ScreenWorkerRequest {
  type: "screen";
  records: SatelliteRecord[];
  options: ScreeningOptions;
}

export type ScreenWorkerResponse =
  | { type: "progress"; progress: ScreeningProgress }
  | { type: "complete"; report: ScreeningReport }
  | { type: "error"; message: string };
