import { CatalogProvider, CatalogStatus } from "@/components/catalog-provider";
import { ElementReadout } from "@/components/element-readout";
import { OrbitalGlobe } from "@/components/orbital-globe";
import { OverheadPasses } from "@/components/overhead-passes";
import Link from "next/link";

export default function HomePage() {
  return (
    <CatalogProvider>
      <main>
        <header className="site-header">
          <a className="wordmark" href="#top" aria-label="Miss Distance home">
            Miss Distance<span aria-hidden="true">°</span>
          </a>
          <nav aria-label="Primary navigation">
            <Link href="/" aria-current="page">Globe</Link>
            <Link href="/approaches">Close approaches</Link>
          </nav>
          <CatalogStatus />
        </header>

        <section className="hero" id="top" aria-labelledby="page-title">
          <div className="intro">
            <h1 id="page-title">Earth is never alone.</h1>
            <p className="lede">
              Visible spacecraft and rocket bodies, propagated in your browser with
              SGP4 from current orbital elements and redrawn every second against UTC.
            </p>
            <ElementReadout />
            <OverheadPasses />
          </div>

          <OrbitalGlobe />
        </section>

        <footer className="site-footer">
          <p>
            Positions are computed in the browser, not precomputed on a server.
            Altitude is compressed on a logarithmic scale so distant orbits remain in
            frame.
          </p>
          <p>
            Current elements come through a cached server route from{" "}
            <a href="https://celestrak.org" rel="noreferrer noopener" target="_blank">
              Celestrak
            </a>
            , a nonprofit that mirrors the public satellite catalog released by the
            US Space Force.
          </p>
          <p>
            Educational demonstration. Not for operational conjunction assessment.
          </p>
        </footer>
      </main>
    </CatalogProvider>
  );
}
