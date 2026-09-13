import type { Metadata } from "next";

import { CollisionReplay } from "@/components/collision-replay";
import { SiteHeader } from "@/components/site-header";
import collisionFixture from "@/fixtures/iridium-cosmos-2009.json";
import verificationFixture from "@/fixtures/sgp4-verification.json";
import { computeCollisionValidation, type CollisionReplayFixture } from "@/lib/replay";
import { verifySgp4Subset } from "@/lib/verification";

export const metadata: Metadata = {
  title: "2009 collision replay — Conjunction Screener",
  description: "Replay the 2009 Iridium 33 and Cosmos 2251 collision using pre-collision orbit data.",
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
          Iridium 33 and Cosmos 2251 collided on 10 February 2009.
          This replay uses their pre-collision orbit data.
        </p>
      </section>
      <CollisionReplay validation={validation} />
      <p>SGP4 tests: {verification.caseCount} reference cases, {verification.sampleCount} positions.
        Maximum difference: {verification.maxPositionErrorKm.toFixed(6)} km.
        These tests cover part of the reference suite. They check the code,
        not the accuracy of live positions.
      </p>
      <footer className="site-footer">
        <p>
          Historical orbit data from{" "}
          <a
            href="https://celestrak.org/events/collision/"
            rel="noreferrer noopener"
            target="_blank"
          >
            CelesTrak
          </a>
          . For learning, not collision avoidance.
        </p>
      </footer>
    </main>
  );
}
