"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ApproachDetail } from "@/components/approach-detail";
import { ApproachTable, type ApproachTableRow } from "@/components/approach-table";
import { RangePlot } from "@/components/range-plot";
import type { SatelliteCatalogPayload } from "@/lib/celestrak";
import type { ScreenWorkerRequest, ScreenWorkerResponse } from "@/lib/screen-messages";
import type { ConjunctionResult, ScreeningProgress, ScreeningReport } from "@/lib/screen";
import { formatElementAgeHours, formatUtcTimestamp, isStaleElementAge } from "@/lib/elements";

const WIDE_SCREEN_QUERY = "(min-width: 900px)";

function subscribeToWideScreen(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_SCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readWideScreen(): boolean {
  return window.matchMedia(WIDE_SCREEN_QUERY).matches;
}

const STAGE_LABELS: Record<ScreeningProgress["stage"], string> = {
  prepare: "Sampling SGP4 trajectories",
  apsis: "Testing radial overlap",
  path: "Comparing swept path bounds",
  propagate: "Finding and refining encounters",
};

export function SatelliteScreen() {
  const workerRef = useRef<Worker | null>(null);
  const [catalog, setCatalog] = useState<SatelliteCatalogPayload | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [thresholdKm, setThresholdKm] = useState(10);
  const [maxObjects, setMaxObjects] = useState(300);
  // Open on a wide screen, folded on a phone, where the controls would
  // otherwise fill the view before a single result appeared. Once the reader
  // opens or closes it themselves, their choice sticks.
  const wideScreen = useSyncExternalStore(
    subscribeToWideScreen,
    readWideScreen,
    () => true,
  );
  const [toggledOpen, setToggledOpen] = useState<boolean | null>(null);
  const settingsOpen = toggledOpen ?? wideScreen;
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
    const refresh = (initial = false) => { void fetch("/api/tle?group=active", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: unknown } | null;
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : `Catalog route returned ${response.status}`,
          );
        }
        const payload = (await response.json()) as SatelliteCatalogPayload;
        if (
          !Array.isArray(payload.satellites) ||
          (payload.group !== "active" && payload.fallbackFor !== "active")
        ) {
          throw new Error("Catalog route returned an invalid active catalog");
        }
        if (active) {
          setCatalog(payload);
          if (initial) runScreen(payload, { windowHours: 24, thresholdKm: 10, maxObjects: 300 });
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Active catalog unavailable");
        setStatus("error");
      }); };
    refresh(true);
    const intervalId = window.setInterval(refresh, 2 * 60 * 60 * 1_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      workerRef.current?.terminate();
    };
  }, [runScreen]);

  const progressPercent = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;
  const tableRows: ApproachTableRow[] = (report?.results ?? []).map((result) => {
    const stale = isStaleElementAge(result.oldestElementAgeHours);
    return {
      id: result.id,
      primaryLabel: result.first.name,
      secondaryLabel: `${result.first.catalogNumber} / ${result.second.name} ${result.second.catalogNumber}`,
      tcaLabel: formatUtcTimestamp(new Date(result.tcaUtc)),
      missDistanceLabel: `${result.missDistanceKm.toFixed(2)} km`,
      relativeVelocityLabel: `${result.relativeVelocityKmS.toFixed(2)} km/s`,
      auxiliaryLabel: `${formatElementAgeHours(result.oldestElementAgeHours)}${stale ? ", stale" : ""}`,
      auxiliaryAlert: stale,
    };
  });

  return (
    <section className="screen-workspace" aria-label="Satellite close approaches">
      <details
        className="screen-controls"
        open={settingsOpen}
        onToggle={(event) => setToggledOpen(event.currentTarget.open)}
      >
        <summary>
          <span>Screening settings</span>
          <span className="measure">
            {windowHours} h, {thresholdKm} km, {maxObjects} objects
          </span>
        </summary>
        <div className="screen-fields">
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
      </details>

      {status === "loading" && <p className="screen-state">Loading the active catalog…</p>}
      {progress && (
        <div className="screen-progress" aria-live="polite">
          <div><span>{STAGE_LABELS[progress.stage]}</span><span className="measure">{progressPercent}%</span></div>
          <progress max="100" value={progressPercent}>{progressPercent}%</progress>
        </div>
      )}
      {error && <p className="screen-error" role="alert">{error}</p>}
      <p className="screen-state">
        Educational screening of the freshest LEO sample, not the full catalog.
        SGP4 predicts separation, not collision probability. Short encounters can
        still be missed by time sampling; public elements have no position uncertainty here.
      </p>
      {catalog?.offlineFixture && <p className="screen-error" role="status">Live catalog unavailable. Using eight archived fixture objects, not an active-catalog search. The 2009 replay is also available offline.</p>}
      {catalog?.stale && !catalog.offlineFixture && <p className="screen-state">Using a cached catalog; upstream freshness could not be confirmed. Check element ages.</p>}
      {catalog?.fallbackFor && <p className="screen-state">Active catalog unavailable; screening the smaller visual catalog.</p>}
      {!!catalog?.discardedRecords && <p className="screen-state">Excluded {catalog.discardedRecords} invalid or duplicate source records.</p>}

      {report && (
        <>
          <dl className="gate-readout">
            <div><dt>{catalog?.fallbackFor === "active" ? "Catalog, visual set" : "Catalog objects"}</dt><dd className="measure">{report.stats.catalogObjects}</dd></div>
            <div><dt>LEO screened</dt><dd className="measure">{report.stats.screenedObjects} / {report.stats.eligibleLeoObjects}</dd></div>
            <div><dt>All pairs</dt><dd className="measure">{report.stats.initialPairs.toLocaleString()}</dd></div>
            <div><dt>After radial gate</dt><dd className="measure">{report.stats.afterApsisPairs.toLocaleString()}</dd></div>
            <div><dt>After path gate</dt><dd className="measure">{report.stats.afterPathPairs.toLocaleString()}</dd></div>
            <div><dt>Elapsed</dt><dd className="measure">{(report.stats.elapsedMs / 1_000).toFixed(1)} s</dd></div>
          </dl>
          <p className="screen-state">{report.results.length} encounters reported; repeat encounters included. Window starts {formatUtcTimestamp(new Date(report.options.startUtc))}. Sampling every {report.options.coarseStepSeconds} s.</p>
          {report.results.length > 0 ? (
            <ApproachTable
              rows={tableRows}
              selectedId={selected?.id ?? null}
              tcaHeading="Closest approach (UTC)"
              auxiliaryHeading="Oldest elements"
              onSelect={(row) => setSelected(report.results.find((result) => result.id === row.id) ?? null)}
            />
          ) : (
            <p className="empty-results">No approaches crossed this threshold in the screened sample.</p>
          )}
          {selected && (
            <ApproachDetail label="Selected pair">
              <RangePlot result={selected} />
            </ApproachDetail>
          )}
        </>
      )}
    </section>
  );
}
