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
  const { records, status: catalogStatus } = useCatalog();
  const workerRef = useRef<Worker | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [state, setState] = useState<PassState>("idle");
  const [cityQuery, setCityQuery] = useState("");
  const [cityError, setCityError] = useState<string | null>(null);
  const [observer, setObserver] = useState<ObserverLocation | null>(null);
  const [passes, setPasses] = useState<SatellitePass[]>([]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  const calculate = (location: ObserverLocation) => {
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
      if (event.data.type === "complete") setPasses(event.data.passes);
      else setPassError(event.data.message);
      setState("ready");
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setPassError("Pass prediction stopped unexpectedly. Please retry.");
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

  return (
    <section className="overhead" aria-labelledby="overhead-title">
      <div className="overhead-heading">
        <div>
          <h2 id="overhead-title">Passes overhead</h2>
          <p>Next 24 hours. Geometric passes above the horizon, not guaranteed visible sightings. Brief grazing passes may be missed.</p>
        </div>
        {state === "idle" || state === "ready" ? (
          <button type="button" disabled={catalogStatus === "loading"} onClick={requestLocation}>
            Use my location
          </button>
        ) : null}
      </div>

      {state === "locating" ? (
        <p className="pass-status" role="status">
          Waiting for permission…
        </p>
      ) : null}

      {state === "calculating" ? (
        <p className="pass-status" role="status">
          Calculating…
        </p>
      ) : null}

      {state === "city" ? (
        <form className="city-form" onSubmit={submitCity}>
          <label htmlFor="city">No location. Pick a city.</label>
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
            <strong>{observer?.label}</strong>, times in your browser’s timezone.
          </p>
          {passError ? <p role="alert">{passError}</p> : passes.length ? (
            <ol>
              {passes.map((pass) => (
                <li key={`${pass.catalogNumber}-${pass.startUtc.toISOString()}`}>
                  <div>
                    <strong>{pass.objectName}</strong>
                    <span className="measure">NORAD {pass.catalogNumber}</span>
                    <span>Elements {formatElementAgeHours(pass.elementAgeHours)}{isStaleElementAge(pass.elementAgeHours) ? ", stale" : ""}</span>
                    {(pass.clippedStart || pass.clippedEnd) && <span>Partial pass at the prediction-window boundary; duration and peak cover only this window.</span>}
                  </div>
                  <dl>
                    <div>
                      <dt>Starts</dt>
                      <dd>
                        <time dateTime={pass.startUtc.toISOString()}>
                          {timeFormatter.format(pass.startUtc)}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Max elevation</dt>
                      <dd className="measure">{pass.maxElevationDeg.toFixed(0)}°</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd className="measure">{formatDuration(pass.durationSeconds)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <p>Nothing crosses your horizon in the next 24 hours.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
