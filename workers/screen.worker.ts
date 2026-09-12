/// <reference lib="webworker" />

import type {
  ScreenWorkerRequest,
  ScreenWorkerResponse,
} from "../lib/screen-messages";
import { screenSatelliteCatalog } from "../lib/screen";

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<ScreenWorkerRequest>) => {
  if (event.data.type !== "screen") return;

  try {
    const report = screenSatelliteCatalog(
      event.data.records,
      event.data.options,
      (progress) => {
        const message: ScreenWorkerResponse = { type: "progress", progress };
        worker.postMessage(message);
      },
    );
    const message: ScreenWorkerResponse = { type: "complete", report };
    worker.postMessage(message);
  } catch (error) {
    const message: ScreenWorkerResponse = {
      type: "error",
      message: error instanceof Error ? error.message : "Screening failed",
    };
    worker.postMessage(message);
  }
});

export {};
