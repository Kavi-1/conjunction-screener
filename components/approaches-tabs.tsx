"use client";

import { useState } from "react";

import { AsteroidApproaches } from "@/components/asteroid-approaches";
import { SatelliteScreen } from "@/components/satellite-screen";

type ApproachTab = "satellites" | "asteroids";

export function ApproachesTabs() {
  const [tab, setTab] = useState<ApproachTab>("satellites");

  return (
    <>
      <div className="approach-tabs" role="tablist" aria-label="Approach data type">
        <button type="button" role="tab" aria-selected={tab === "satellites"} aria-controls="satellite-panel" onClick={() => setTab("satellites")}>Satellites</button>
        <button type="button" role="tab" aria-selected={tab === "asteroids"} aria-controls="asteroid-panel" onClick={() => setTab("asteroids")}>Asteroids</button>
      </div>
      <div id={tab === "satellites" ? "satellite-panel" : "asteroid-panel"} role="tabpanel">
        {tab === "satellites" ? <SatelliteScreen /> : <AsteroidApproaches />}
      </div>
    </>
  );
}
