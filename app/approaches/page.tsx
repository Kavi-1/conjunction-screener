import type { Metadata } from "next";

import { ApproachesTabs } from "@/components/approaches-tabs";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Close approaches — Conjunction Screener",
  description: "Check satellite close approaches and view NASA JPL asteroid predictions.",
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
        <summary>How it works</summary>
        <p>SGP4 calculates the positions. Filters check orbit heights and path
          bounds to rule out distant pairs. They allow for movement between
          samples, assuming a maximum speed of 12 km/s per object. The remaining
          pairs are checked more closely to find when they are nearest.
          Repeat encounters are included. The calculation runs in a Web Worker.</p>
        <p>Sampling can miss close approaches. Orbit uncertainty and collision
          probability are not calculated.</p>
      </details>
      <footer className="site-footer">
        <p>
          Satellite data from{" "}
          <a href="https://celestrak.org" rel="noreferrer noopener" target="_blank">
            CelesTrak
          </a>
          . Asteroid data from{" "}
          <a href="https://cneos.jpl.nasa.gov" rel="noreferrer noopener" target="_blank">
            NASA JPL CNEOS
          </a>
          . For learning, not collision avoidance.
        </p>
      </footer>
    </main>
  );
}
