/// <reference lib="webworker" />
import { predictUpcomingPassesUtc } from "../lib/passes";
import type { PassWorkerRequest, PassWorkerResponse } from "../lib/pass-messages";

const worker = self as DedicatedWorkerGlobalScope;
worker.addEventListener("message", (event: MessageEvent<PassWorkerRequest>) => {
  let response: PassWorkerResponse;
  try {
    const { records, observer, startUtc } = event.data;
    response = { type: "complete", passes: predictUpcomingPassesUtc(records, observer, new Date(startUtc), 5) };
  } catch (error) {
    response = { type: "error", message: error instanceof Error ? error.message : "Pass prediction failed" };
  }
  worker.postMessage(response);
});
