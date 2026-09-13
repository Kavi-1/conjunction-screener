"use client";

import {
  formatElementAgeHours,
  formatUtcTimestamp,
  isStaleElementAge,
} from "@/lib/elements";
import type { SatellitePosition } from "@/lib/propagate";

interface ObjectDetailProps {
  positions: SatellitePosition[];
  selectedCatalogNumber: string | null;
  onSelect: (catalogNumber: string) => void;
}

export function ObjectDetail({
  positions,
  selectedCatalogNumber,
  onSelect,
}: ObjectDetailProps) {
  const selected =
    positions.find(
      (position) => position.catalogNumber === selectedCatalogNumber,
    ) ??
    positions[0] ??
    null;

  if (!selected) return null;
  const stale = isStaleElementAge(selected.elementAgeHours);

  return (
    <section className="object-inspector" aria-label="Tracked object details">
      <div className="object-inspector-head">
        <div>
          <h2>{selected.name}</h2>
          <p className="measure">
            NORAD {selected.catalogNumber}, {selected.internationalDesignator},{" "}
            {selected.regime}
          </p>
        </div>
        <div className="object-picker">
          <label htmlFor="object-select">Pick another</label>
          <select
            id="object-select"
            value={selected.catalogNumber}
            onChange={(event) => onSelect(event.target.value)}
          >
            {positions.map((position) => (
              <option key={position.catalogNumber} value={position.catalogNumber}>
                {position.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <dl>
        <div>
          <dt>Altitude</dt>
          <dd className="measure">{selected.altitudeKm.toFixed(0)} km</dd>
        </div>
        <div>
          <dt>Velocity</dt>
          <dd className="measure">{selected.velocityKmS.toFixed(2)} km/s</dd>
        </div>
        <div>
          <dt>Orbital period</dt>
          <dd className="measure">{selected.orbitalPeriodMinutes.toFixed(1)} min</dd>
        </div>
        <div>
          <dt>Element epoch</dt>
          <dd className="measure">
            <time dateTime={selected.elementEpochUtc.toISOString()}>
              {formatUtcTimestamp(selected.elementEpochUtc)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Element age</dt>
          <dd className="measure" data-stale={stale}>
            {formatElementAgeHours(selected.elementAgeHours)}
          </dd>
        </div>
      </dl>

      <p className="track-note">
        <span aria-hidden="true" /> Its path over the next{" "}
        {selected.orbitalPeriodMinutes.toFixed(0)} minutes. It drifts west as Earth
        turns underneath.
      </p>

      {stale ? (
        <p className="object-inspector-warning">
          These elements are old enough to put this position off by kilometers.
        </p>
      ) : null}
    </section>
  );
}
