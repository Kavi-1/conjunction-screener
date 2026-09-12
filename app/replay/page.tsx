import type { Metadata } from "next";
import Link from "next/link";

import { CollisionReplay } from "@/components/collision-replay";

export const metadata: Metadata = {
  title: "2009 collision replay — Miss Distance",
  description: "Replay the Iridium 33 and Cosmos 2251 collision from archived TLEs.",
};

export default function ReplayPage() {
  return (
    <main>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Miss Distance home">
          Miss Distance<span aria-hidden="true">°</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Globe</Link>
          <Link href="/approaches">Close approaches</Link>
          <Link href="/replay" aria-current="page">2009 replay</Link>
        </nav>
      </header>
      <section className="replay-intro">
        <h1>Six minutes from impact.</h1>
        <p>
          On February 10, 2009, Iridium 33 and the inactive Cosmos 2251 met over
          northern Siberia. These are their last public element sets before the event.
        </p>
      </section>
      <CollisionReplay />
      <footer className="site-footer">
        <p>
          Historical elements and the documented event time come from Celestrak’s
          archived collision analysis and scenario.
        </p>
        <p>Educational demonstration. Public TLEs are not operational tracking data.</p>
      </footer>
    </main>
  );
}
