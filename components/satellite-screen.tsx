"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApproachTable } from "@/components/approach-table";
import { RangePlot } from "@/components/range-plot";
import type { SatelliteCatalogPayload } from "@/lib/celestrak";
import type { ScreenWorkerRequest, ScreenWorkerResponse } from "@/lib/screen-messages";
import type { ConjunctionResult, ScreeningProgress, ScreeningReport } from "@/lib/screen";

const STAGE_LABELS: Record<ScreeningProgress["stage"], string> = {
  prepare: "Preparing orbital geometry",
  apsis: "Testing radial overlap",
  path: "Comparing orbit paths",
  propagate: "Propagating candidate pairs",
};

export function SatelliteScreen() {
  const workerRef = useRef<Worker | null>(null);
  const [catalog, setCatalog] = useState<SatelliteCatalogPayload | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [thresholdKm, setThresholdKm] = useState(10);
  const [maxObjects, setMaxObjects] = useState(300);
  const [progress, setProgress] = useState<ScreeningProgress | null>(null);
  const [report, setReport] = useState<ScreeningReport | null>(null);
  const [selected, setSelected] = useState<ConjunctionResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "screening" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const runScreen = useCallback((
    payload: SatelliteCatalogPayload,
    options: { windowHours: number; thresholdKm: number; maxObjects: number },
  ) => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../workers/screen.worker.ts", import.meta.url));
    workerRef.current = worker;
    setStatus("screening");
    setError(null);
    setReport(null);
    setSelected(null);
    setProgress({ stage: "prepare", completed: 0, total: 1 });

    worker.addEventListener("message", (event: MessageEvent<ScreenWorkerResponse>) => {
      if (event.data.type === "progress") setProgress(event.data.progress);
      if (event.data.type === "complete") {
        setReport(event.data.report);
        setSelected(event.data.report.results[0] ?? null);
        setStatus("ready");
        setProgress(null);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
      if (event.data.type === "error") {
        setError(event.data.message);
        setStatus("error");
        setProgress(null);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    });
    worker.addEventListener("error", () => {
      setError("The screening worker stopped unexpectedly.");
      setStatus("error");
      setProgress(null);
    });

    const request: ScreenWorkerRequest = {
      type: "screen",
      records: payload.satellites,
      options: {
        startUtc: new Date().toISOString(),
        ...options,
      },
    };
    worker.postMessage(request);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/tle?group=active", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog route returned ${response.status}`);
        const payload = (await response.json()) as SatelliteCatalogPayload;
        if (!Array.isArray(payload.satellites) || payload.group !== "active") {
          throw new Error("Catalog route returned an invalid active catalog");
        }
        if (active) {
          setCatalog(payload);
          runScreen(payload, { windowHours: 24, thresholdKm: 10, maxObjects: 300 });
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Active catalog unavailable");
        setStatus("error");
      });
    return () => {
      active = false;
      workerRef.current?.terminate();
    };
  }, [runScreen]);

  const progressPercent = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <section className="screen-workspace" aria-labelledby="satellite-tab">
      <div className="screen-controls">
        <div>
          <h2 id="satellite-tab">Satellites</h2>
          <p>
            Close approaches computed locally from current Celestrak elements. The
            worker screens the freshest active LEO objects without blocking this page.
          </p>
        </div>
        <label>
          Window <output className="measure">{windowHours} h</output>
          <input type="range" min="6" max="48" step="6" value={windowHours} onChange={(event) => setWindowHours(Number(event.target.value))} />
        </label>
        <label>
          Threshold <output className="measure">{thresholdKm} km</output>
          <input type="range" min="1" max="50" step="1" value={thresholdKm} onChange={(event) => setThresholdKm(Number(event.target.value))} />
        </label>
        <label>
          Catalog cap <output className="measure">{maxObjects}</output>
          <input type="range" min="100" max="500" step="50" value={maxObjects} onChange={(event) => setMaxObjects(Number(event.target.value))} />
        </label>
        <button type="button" disabled={!catalog || status === "screening"} onClick={() => catalog && runScreen(catalog, { windowHours, thresholdKm, maxObjects })}>
          {status === "screening" ? "Screening…" : "Run screening"}
        </button>
      </div>

      {status === "loading" && <p className="screen-state">Loading the active catalog…</p>}
      {progress && (
        <div className="screen-progress" aria-live="polite">
          <div><span>{STAGE_LABELS[progress.stage]}</span><span className="measure">{progressPercent}%</span></div>
          <progress max="100" value={progressPercent}>{progressPercent}%</progress>
        </div>
      )}
      {error && <p className="screen-error" role="alert">{error}</p>}

      {report && (
        <>
          <dl className="gate-readout">
            <div><dt>Active catalog</dt><dd className="measure">{report.stats.catalogObjects}</dd></div>
            <div><dt>Freshest LEO sample</dt><dd className="measure">{report.stats.screenedObjects} / {report.stats.eligibleLeoObjects}</dd></div>
            <div><dt>All pairs</dt><dd className="measure">{report.stats.initialPairs.toLocaleString()}</dd></div>
            <div><dt>After apsis gate</dt><dd className="measure">{report.stats.afterApsisPairs.toLocaleString()}</dd></div>
            <div><dt>After path gate</dt><dd className="measure">{report.stats.afterPathPairs.toLocaleString()}</dd></div>
            <div><dt>Worker time</dt><dd className="measure">{(report.stats.elapsedMs / 1_000).toFixed(1)} s</dd></div>
          </dl>
          {report.results.length > 0 ? (
            <ApproachTable results={report.results} selectedId={selected?.id ?? null} onSelect={setSelected} />
          ) : (
            <p className="empty-results">No approaches crossed this threshold in the screened sample.</p>
          )}
          {selected && <RangePlot result={selected} />}
        </>
      )}
    </section>
  );
}
