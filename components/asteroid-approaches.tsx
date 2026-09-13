"use client";

import { useEffect, useState } from "react";

import { ApproachDetail } from "@/components/approach-detail";
import { ApproachTable, type ApproachTableRow } from "@/components/approach-table";
import type { NeoApproach, NeoApproachPayload } from "@/lib/cneos";
import { formatUtcTimestamp } from "@/lib/elements";

function distanceLabel(distanceKm: number): string {
  return `${Math.round(distanceKm).toLocaleString("en-US")} km`;
}

export function AsteroidApproaches() {
  const [payload, setPayload] = useState<NeoApproachPayload | null>(null);
  const [selected, setSelected] = useState<NeoApproach | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/neo", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load NASA JPL data (HTTP ${response.status}).`);
        const next = (await response.json()) as NeoApproachPayload;
        if (next.source !== "nasa-jpl-cneos" || !Array.isArray(next.approaches)) {
          throw new Error("Could not read the NASA JPL data.");
        }
        if (active) {
          setPayload(next);
          setSelected(next.approaches[0] ?? null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "NASA JPL data unavailable");
      });
    return () => { active = false; };
  }, []);

  const rows: ApproachTableRow[] = (payload?.approaches ?? []).map((approach) => ({
    id: approach.id,
    primaryLabel: approach.name,
    secondaryLabel: `${approach.designation}, orbit ${approach.orbitId}`,
    tcaLabel: approach.tcaTdb,
    missDistanceLabel: distanceLabel(approach.missDistanceKm),
    relativeVelocityLabel: `${approach.relativeVelocityKmS.toFixed(2)} km/s`,
    auxiliaryLabel:
      approach.diameterKm === null ? "—" : `${approach.diameterKm.toFixed(3)} km`,
  }));

  return (
    <section className="screen-workspace" aria-label="Asteroid close approaches">
      <div className="asteroid-heading">
        <p>Predictions from NASA JPL CNEOS. Next 60 days, within 0.05 au of Earth’s center.</p>
        {payload && (
          <span className="measure">
            {payload.approaches.length} approaches{payload.stale ? ", cached" : ""}
          </span>
        )}
      </div>
      {payload && <p className="screen-state">Fetched {formatUtcTimestamp(new Date(payload.fetchedAtUtc))}{payload.stale ? ". Refresh failed; showing cached data" : ""}.</p>}
      {!payload && !error && <p className="screen-state">Loading asteroid data…</p>}
      {error && <p className="screen-error" role="alert">{error}</p>}
      {payload && rows.length === 0 && <p className="empty-results">NASA JPL reports no matching approaches.</p>}
      {rows.length > 0 && (
        <ApproachTable
          rows={rows}
          selectedId={selected?.id ?? null}
          tcaHeading="Closest approach (TDB)"
          auxiliaryHeading="Diameter"
          onSelect={(row) => setSelected(payload?.approaches.find((approach) => approach.id === row.id) ?? null)}
        />
      )}
      {selected && (
        <ApproachDetail label={selected.name}>
          <h3 className="detail-heading">{selected.name}</h3>
          <dl className="asteroid-detail-grid">
            <div><dt>Predicted distance</dt><dd className="measure">{distanceLabel(selected.missDistanceKm)}</dd></div>
            <div><dt>Distance range (3σ)</dt><dd className="measure">{distanceLabel(selected.minimumDistanceKm)} – {distanceLabel(selected.maximumDistanceKm)}</dd></div>
            <div><dt>Time uncertainty (3σ)</dt><dd className="measure">{selected.timeUncertainty}</dd></div>
            <div><dt>Diameter (±1σ)</dt><dd className="measure">{selected.diameterKm === null ? "Unknown" : `${selected.diameterKm.toFixed(3)} km${selected.diameterSigmaKm === null ? "" : ` ± ${selected.diameterSigmaKm.toFixed(3)} km`}`}</dd></div>
          </dl>
          <p>Time uncertainty is in hours:minutes, with days before the underscore.</p>
        </ApproachDetail>
      )}
    </section>
  );
}
