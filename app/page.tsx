import { OrbitalGlobe } from "@/components/orbital-globe";

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Who’s Up There home">
          Who’s Up There<span aria-hidden="true">°</span>
        </a>
        <p className="mode-label">
          <span aria-hidden="true" /> Offline fixture
        </p>
      </header>

      <section className="hero" id="top" aria-labelledby="page-title">
        <div className="intro">
          <p className="kicker">A small view of a crowded sky</p>
          <h1 id="page-title">Earth is never alone.</h1>
          <p className="lede">
            Eight catalogued objects, propagated from fixed two-line elements and
            placed around the planet in your browser.
          </p>
        </div>

        <OrbitalGlobe />
      </section>

      <footer className="site-footer">
        <p>
          Positions use SGP4 propagation. Altitude is compressed visually so distant
          orbits remain in frame.
        </p>
        <p>Educational display — not for operational conjunction assessment.</p>
      </footer>
    </main>
  );
}
