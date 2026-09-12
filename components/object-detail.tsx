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
    <aside className="object-inspector" aria-label="Tracked object details">
      <label htmlFor="object-select">Inspect an object</label>
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
      <dl>
        <div>
          <dt>Catalog / designator</dt>
          <dd className="measure">
            {selected.catalogNumber} / {selected.internationalDesignator}
          </dd>
        </div>
        <div>
          <dt>Orbit regime</dt>
          <dd className="measure">{selected.regime}</dd>
        </div>
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
    </aside>
  );
}
