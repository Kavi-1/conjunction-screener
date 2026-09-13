"use client";

import { useCatalog } from "@/components/catalog-provider";
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
  const { preview, returnToLive } = useCatalog();
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
      {preview && (
        <div className="pass-preview">
          <p role="status">
            Preview · <time dateTime={preview.atUtc.toISOString()}>{formatUtcTimestamp(preview.atUtc)} UTC</time>
            <small>Highest point of the pass · {preview.observer.label}</small>
          </p>
          <button type="button" onClick={returnToLive}>Back to live</button>
        </div>
      )}
      <div className="object-inspector-head">
        <div>
          <h2>{selected.name}</h2>
          <p className="measure">
            NORAD {selected.catalogNumber}, {selected.internationalDesignator},{" "}
            {selected.regime}
          </p>
        </div>
        <div className="object-picker">
          <label htmlFor="object-select">Choose an object</label>
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
          <dt>Speed</dt>
          <dd className="measure">{selected.velocityKmS.toFixed(2)} km/s</dd>
        </div>
        <div>
          <dt>Orbital period</dt>
          <dd className="measure">{selected.orbitalPeriodMinutes.toFixed(1)} min</dd>
        </div>
        <div>
          <dt>Orbit epoch (UTC)</dt>
          <dd className="measure">
            <time dateTime={selected.elementEpochUtc.toISOString()}>
              {formatUtcTimestamp(selected.elementEpochUtc)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Orbit data age</dt>
          <dd className="measure" data-stale={stale}>
            {formatElementAgeHours(selected.elementAgeHours)}
          </dd>
        </div>
      </dl>

      <p className="track-note">
        <span aria-hidden="true" /> Predicted path {preview ? "from the preview time for" : "for the next"}{" "}
        {selected.orbitalPeriodMinutes.toFixed(0)} minutes.
      </p>

      {stale ? (
        <p className="object-inspector-warning">
          Old orbit data. This position may be off by kilometers.
        </p>
      ) : null}
    </section>
  );
}
