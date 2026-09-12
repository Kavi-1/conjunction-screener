import { ElementReadout } from "@/components/element-readout";
import { OrbitalGlobe } from "@/components/orbital-globe";

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Miss Distance home">
          Miss Distance<span aria-hidden="true">°</span>
        </a>
        <p className="feed-state">
          <span aria-hidden="true" /> Fixture element sets, not a live feed
        </p>
      </header>

      <section className="hero" id="top" aria-labelledby="page-title">
        <div className="intro">
          <h1 id="page-title">Earth is never alone.</h1>
          <p className="lede">
            Eight catalogued objects, propagated in your browser with SGP4 from
            published two-line element sets and redrawn every second against UTC.
          </p>
          <ElementReadout />
        </div>

        <OrbitalGlobe />
      </section>

      <footer className="site-footer">
        <p>
          Positions are computed in the browser, not precomputed on a server.
          Altitude is compressed on a logarithmic scale so every orbit regime stays
          in frame.
        </p>
        <p>
          Element sets from{" "}
          <a href="https://celestrak.org" rel="noreferrer noopener" target="_blank">
            Celestrak
          </a>
          , a nonprofit that mirrors the public satellite catalog released by the US
          Space Force.
        </p>
        <p>
          Educational demonstration. Not for operational conjunction assessment.
        </p>
      </footer>
    </main>
  );
}
