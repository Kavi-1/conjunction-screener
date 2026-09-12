"use client";

import { useEffect, useState } from "react";

import { ApproachDetail } from "@/components/approach-detail";
import { ApproachTable, type ApproachTableRow } from "@/components/approach-table";
import type { NeoApproach, NeoApproachPayload } from "@/lib/cneos";

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
        if (!response.ok) throw new Error(`NASA JPL route returned ${response.status}`);
        const next = (await response.json()) as NeoApproachPayload;
        if (next.source !== "nasa-jpl-cneos" || !Array.isArray(next.approaches)) {
          throw new Error("NASA JPL route returned an invalid response");
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
    secondaryLabel: `Designation ${approach.designation} · orbit ${approach.orbitId}`,
    tcaLabel: approach.tcaTdb,
    missDistanceLabel: distanceLabel(approach.missDistanceKm),
    relativeVelocityLabel: `${approach.relativeVelocityKmS.toFixed(2)} km/s`,
    auxiliaryLabel: approach.diameterKm === null
      ? "Diameter unknown"
      : `${approach.diameterKm.toFixed(3)} km diameter`,
  }));

  return (
    <section className="screen-workspace" aria-labelledby="asteroid-tab">
      <div className="asteroid-heading">
        <div>
          <h2 id="asteroid-tab">Asteroids</h2>
          <p>
            Earth approaches published by NASA JPL CNEOS for the next 60 days,
            limited to 0.05 au. These values are retrieved, not propagated here.
          </p>
        </div>
        {payload && <span className="measure">{payload.approaches.length} approaches{payload.stale ? " · cached" : ""}</span>}
      </div>
      {!payload && !error && <p className="screen-state">Loading NASA JPL approaches…</p>}
      {error && <p className="screen-error" role="alert">{error}</p>}
      {payload && rows.length === 0 && <p className="empty-results">NASA JPL reports no matching approaches.</p>}
      {rows.length > 0 && (
        <ApproachTable
          rows={rows}
          selectedId={selected?.id ?? null}
          tcaHeading="Closest approach (TDB)"
          auxiliaryHeading="Estimated size"
          onSelect={(row) => setSelected(payload?.approaches.find((approach) => approach.id === row.id) ?? null)}
        />
      )}
      {selected && (
        <ApproachDetail
          title={selected.name}
          description="Published close-approach solution from the NASA JPL Small-Body Database."
        >
          <dl className="asteroid-detail-grid">
            <div><dt>Nominal miss</dt><dd className="measure">{distanceLabel(selected.missDistanceKm)}</dd></div>
            <div><dt>3σ distance interval</dt><dd className="measure">{distanceLabel(selected.minimumDistanceKm)} – {distanceLabel(selected.maximumDistanceKm)}</dd></div>
            <div><dt>Time uncertainty</dt><dd className="measure">{selected.timeUncertainty}</dd></div>
            <div><dt>Diameter</dt><dd className="measure">{selected.diameterKm === null ? "Unknown" : `${selected.diameterKm.toFixed(3)} km${selected.diameterSigmaKm === null ? "" : ` ± ${selected.diameterSigmaKm.toFixed(3)} km`}`}</dd></div>
          </dl>
        </ApproachDetail>
      )}
    </section>
  );
}
