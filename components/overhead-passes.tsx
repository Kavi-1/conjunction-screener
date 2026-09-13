"use client";

import { useEffect, useRef, useState } from "react";

import { useCatalog } from "@/components/catalog-provider";
import { CITY_LOCATIONS, findCityLocation } from "@/lib/cities";
import type { ObserverLocation, SatellitePass } from "@/lib/passes";
import type { PassWorkerRequest, PassWorkerResponse } from "@/lib/pass-messages";
import { formatElementAgeHours, isStaleElementAge } from "@/lib/elements";

type PassState = "idle" | "locating" | "city" | "calculating" | "ready";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.round(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function OverheadPasses() {
  const {
    records,
    status: catalogStatus,
    selectedCatalogNumber,
    preview,
    previewPass,
    returnToLive,
  } = useCatalog();
  const workerRef = useRef<Worker | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [state, setState] = useState<PassState>("idle");
  const [cityQuery, setCityQuery] = useState("");
  const [cityError, setCityError] = useState<string | null>(null);
  const [observer, setObserver] = useState<ObserverLocation | null>(null);
  const [passes, setPasses] = useState<SatellitePass[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (state !== "ready") return;
    // Use wall-clock time even while the globe is previewing a future pass.
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [state]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  const calculate = (location: ObserverLocation) => {
    returnToLive();
    setObserver(location);
    setState("calculating");
    setCityError(null);
    setPassError(null);
    setPasses([]);
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../workers/passes.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<PassWorkerResponse>) => {
      if (workerRef.current !== worker) return;
      setNowMs(Date.now());
      if (event.data.type === "complete") setPasses(event.data.passes);
      else setPassError(event.data.message);
      setState("ready");
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setPassError("Could not calculate passes. Try again.");
      setState("ready");
      worker.terminate();
      workerRef.current = null;
    };
    const request: PassWorkerRequest = { records, observer: location, startUtc: new Date().toISOString() };
    worker.postMessage(request);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setState("city");
      return;
    }

    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        calculate({
          label: "Your location",
          latitudeDeg: position.coords.latitude,
          longitudeDeg: position.coords.longitude,
          heightKm: Math.max(0, position.coords.altitude ?? 0) / 1_000,
        }),
      () => setState("city"),
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 8_000 },
    );
  };

  const submitCity = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const location = findCityLocation(cityQuery);
    if (!location) {
      setCityError("Pick a city from the list.");
      return;
    }
    calculate(location);
  };

  const closePasses = () => {
    returnToLive();
    workerRef.current?.terminate();
    workerRef.current = null;
    setState("idle");
    setObserver(null);
    setPasses([]);
    setPassError(null);
    setCityError(null);
  };

  return (
    <section
      className="overhead"
      aria-labelledby="overhead-title"
      data-active={state !== "idle"}
    >
      <div className="overhead-heading">
        <div>
          <h2 id="overhead-title">Upcoming passes</h2>
          <p>Find passes near you in the next 24 hours.</p>
        </div>
        <div className="overhead-actions">
          {state === "idle" || state === "ready" ? (
            <button type="button" disabled={catalogStatus === "loading"} onClick={requestLocation}>
              {state === "ready" ? "Refresh" : "Use my location"}
            </button>
          ) : null}
          {state !== "idle" ? (
            <button className="overhead-close" type="button" onClick={closePasses}>
              Close
            </button>
          ) : null}
        </div>
      </div>

      {state === "locating" ? (
        <p className="pass-status" role="status">
          Waiting for location access…
        </p>
      ) : null}

      {state === "calculating" ? (
        <p className="pass-status" role="status">
          Finding passes…
        </p>
      ) : null}

      {state === "city" ? (
        <form className="city-form" onSubmit={submitCity}>
          <label htmlFor="city">Choose a city</label>
          <div>
            <input
              id="city"
              list="cities"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              placeholder="New York"
              autoComplete="off"
            />
            <datalist id="cities">
              {CITY_LOCATIONS.map((city) => (
                <option key={city.label} value={city.label} />
              ))}
            </datalist>
            <button type="submit">Find passes</button>
          </div>
          {cityError ? <p role="alert">{cityError}</p> : null}
        </form>
      ) : null}

      {state === "ready" ? (
        <div className="pass-results">
          <p>
            <strong>{observer?.label}</strong>. Times use your device’s timezone.
          </p>
          {passError ? <p role="alert">{passError}</p> : passes.length ? (
            <ol>
              {passes.map((pass) => (
                <li key={`${pass.catalogNumber}-${pass.startUtc.toISOString()}`}>
                  <button
                    className="pass-result"
                    type="button"
                    aria-pressed={selectedCatalogNumber === pass.catalogNumber &&
                      preview?.atUtc.getTime() === pass.maxElevationAtUtc.getTime()}
                    onClick={() => observer && previewPass(pass, observer)}
                  >
                    <span className="pass-result-object">
                      <strong>{pass.objectName}</strong>
                      <small>
                        NORAD {pass.catalogNumber} · data {formatElementAgeHours(pass.elementAgeHours)}
                        {isStaleElementAge(pass.elementAgeHours) ? ", old" : ""}
                      </small>
                    </span>
                    <span className="pass-result-measures">
                      {pass.startUtc.getTime() <= nowMs && nowMs < pass.endUtc.getTime() ? (
                        <span className="pass-above-horizon">
                          <span aria-hidden="true" />Above horizon now
                        </span>
                      ) : nowMs >= pass.endUtc.getTime() ? (
                        <span className="pass-ended">Ended</span>
                      ) : (
                        <time dateTime={pass.startUtc.toISOString()}>
                          {timeFormatter.format(pass.startUtc)}
                        </time>
                      )}
                      <small className="measure">
                        {pass.maxElevationDeg.toFixed(0)}° · {formatDuration(pass.durationSeconds)}
                        {(pass.clippedStart || pass.clippedEnd) ? " · partial" : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>No passes found in the next 24 hours.</p>
          )}
          {!passError && <p>You may not be able to see every pass. Short passes can be missed.</p>}
        </div>
      ) : null}
    </section>
  );
}
