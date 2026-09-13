import type { Metadata } from "next";

import { CollisionReplay } from "@/components/collision-replay";
import { SiteHeader } from "@/components/site-header";
import collisionFixture from "@/fixtures/iridium-cosmos-2009.json";
import verificationFixture from "@/fixtures/sgp4-verification.json";
import { computeCollisionValidation, type CollisionReplayFixture } from "@/lib/replay";
import { verifySgp4Subset } from "@/lib/verification";

export const metadata: Metadata = {
  title: "2009 collision replay — Conjunction Screener",
  description: "Replay the Iridium 33 and Cosmos 2251 collision from archived TLEs.",
};

export default function ReplayPage() {
  const validation = computeCollisionValidation(collisionFixture as CollisionReplayFixture);
  const verification = verifySgp4Subset(verificationFixture);
  return (
    <main className="app-shell">
      <SiteHeader current="replay" />
      <section className="page-intro">
        <h1>2009 collision replay</h1>
        <p>
          10 February 2009, over northern Siberia. These are the last element sets
          published for Iridium 33 and the dead Cosmos 2251 before they met.
        </p>
      </section>
      <CollisionReplay validation={validation} />
      <p>SGP4 wiring check: {verification.caseCount} official Vallado/Celestrak cases,
        {" "}{verification.sampleCount} sample positions. Maximum position difference through
        the app’s millisecond Date path: {verification.maxPositionErrorKm.toFixed(6)} km.
        This is a reference-vector subset, not the full suite or a measure of real-world orbit accuracy.
      </p>
      <footer className="site-footer">
        <p>
          Archived elements from{" "}
          <a
            href="https://celestrak.org/events/collision/"
            rel="noreferrer noopener"
            target="_blank"
          >
            Celestrak
          </a>
          . Not for operational use.
        </p>
      </footer>
    </main>
  );
}
