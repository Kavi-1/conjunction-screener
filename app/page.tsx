import { CatalogProvider, CatalogStatus } from "@/components/catalog-provider";
import { ElementReadout } from "@/components/element-readout";
import { OrbitalGlobe } from "@/components/orbital-globe";
import { OverheadPasses } from "@/components/overhead-passes";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <CatalogProvider>
      <main className="app-shell">
        <SiteHeader current="globe" status={<CatalogStatus />} />

        <section className="hero" id="top" aria-labelledby="page-title">
          <div className="intro">
            <h1 id="page-title">Earth is never alone.</h1>
            <ElementReadout />
            <OverheadPasses />
          </div>

          <OrbitalGlobe />
        </section>

        <footer className="site-footer">
          <p>
            Elements from{" "}
            <a href="https://celestrak.org" rel="noreferrer noopener" target="_blank">
              Celestrak
            </a>
            , a nonprofit that mirrors the public satellite catalog released by the
            US Space Force. Not for operational use.
          </p>
        </footer>
      </main>
    </CatalogProvider>
  );
}
