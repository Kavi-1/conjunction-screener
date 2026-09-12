import type { Metadata } from "next";
import Link from "next/link";

import { SatelliteScreen } from "@/components/satellite-screen";

export const metadata: Metadata = {
  title: "Close approaches — Miss Distance",
  description: "Browser-computed satellite conjunction screening using SGP4.",
};

export default function ApproachesPage() {
  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Miss Distance home">
          Miss Distance<span aria-hidden="true">°</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Globe</Link>
          <Link href="/approaches" aria-current="page">Close approaches</Link>
        </nav>
      </header>
      <section className="approaches-intro">
        <h1>Where paths nearly meet.</h1>
        <p>
          A staged orbital screen removes impossible pairs before propagating the
          survivors. Results depend on public element sets that age quickly.
        </p>
      </section>
      <SatelliteScreen />
      <footer className="site-footer">
        <p>
          Orbital elements are provided by Celestrak, a nonprofit that mirrors the
          public catalog released by the US Space Force.
        </p>
        <p>Educational demonstration. Not for operational conjunction assessment.</p>
      </footer>
    </main>
  );
}
