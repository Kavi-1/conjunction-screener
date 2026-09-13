import type { Metadata } from "next";

import { ApproachesTabs } from "@/components/approaches-tabs";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Close approaches — Conjunction Screener",
  description: "Browser-computed satellite conjunction screening using SGP4.",
};

export default function ApproachesPage() {
  return (
    <main className="app-shell">
      <SiteHeader current="approaches" />
      <section className="page-intro">
        <h1>Close approaches</h1>
      </section>
      <ApproachesTabs />
      <details className="screen-controls">
        <summary>How the satellite calculation works</summary>
        <p>Each object is propagated once at each sample time using SGP4. A radial
          envelope filter removes widely separated orbits, then bounding boxes
          around short trajectory sections remove separated paths. Both filters
          allow for between-sample travel under a 12 km/s per-object speed bound.
          The remaining pairs are scanned for local distance minima and refined
          in time. Cached positions keep this in a browser worker; the interface
          stays responsive. No covariance data or collision probability is computed.</p>
      </details>
      <footer className="site-footer">
        <p>
          Satellite data from{" "}
          <a href="https://celestrak.org" rel="noreferrer noopener" target="_blank">
            Celestrak
          </a>
          . Asteroid data from{" "}
          <a href="https://cneos.jpl.nasa.gov" rel="noreferrer noopener" target="_blank">
            NASA JPL CNEOS
          </a>
          . Not for operational use.
        </p>
      </footer>
    </main>
  );
}
