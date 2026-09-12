"use client";

import { useEffect, useRef, useState } from "react";

import { useCatalog } from "@/components/catalog-provider";
import { CITY_LOCATIONS, findCityLocation } from "@/lib/cities";
import {
  predictUpcomingPassesUtc,
  type ObserverLocation,
  type SatellitePass,
} from "@/lib/passes";

type PassState = "idle" | "locating" | "city" | "calculating" | "ready";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function OverheadPasses() {
  const { records } = useCatalog();
  const timerRef = useRef<number | null>(null);
  const [state, setState] = useState<PassState>("idle");
  const [cityQuery, setCityQuery] = useState("");
  const [cityError, setCityError] = useState<string | null>(null);
  const [observer, setObserver] = useState<ObserverLocation | null>(null);
  const [passes, setPasses] = useState<SatellitePass[]>([]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const calculate = (location: ObserverLocation) => {
    setObserver(location);
    setState("calculating");
    setCityError(null);
    timerRef.current = window.setTimeout(() => {
      setPasses(predictUpcomingPassesUtc(records, location, new Date(), 5));
      setState("ready");
      timerRef.current = null;
    }, 0);
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
      setCityError("Choose one of the listed cities.");
      return;
    }
    calculate(location);
  };

  return (
    <section className="overhead" aria-labelledby="overhead-title">
      <div className="overhead-heading">
        <div>
          <h2 id="overhead-title">What passes overhead?</h2>
          <p>Next 24 hours, above your local horizon.</p>
        </div>
        {state === "idle" || state === "ready" ? (
          <button type="button" onClick={requestLocation}>
            Use my location
          </button>
        ) : null}
      </div>

      {state === "locating" ? (
        <p className="pass-status" role="status">
          Waiting for location permission…
        </p>
      ) : null}

      {state === "calculating" ? (
        <p className="pass-status" role="status">
          Calculating horizon crossings…
        </p>
      ) : null}

      {state === "city" ? (
        <form className="city-form" onSubmit={submitCity}>
          <label htmlFor="city">Location access unavailable. Choose a city.</label>
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
            Near <strong>{observer?.label}</strong>. Times shown in your device’s time
            zone.
          </p>
          {passes.length ? (
            <ol>
              {passes.map((pass) => (
                <li key={`${pass.catalogNumber}-${pass.startUtc.toISOString()}`}>
                  <div>
                    <strong>{pass.objectName}</strong>
                    <span className="measure">NORAD {pass.catalogNumber}</span>
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
            <p>No passes from this catalog cross the horizon in the next 24 hours.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
