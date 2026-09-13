"use client";

import type { GlobeInstance } from "globe.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";

import { useCatalog } from "@/components/catalog-provider";
import { useLandPolygons, type LandFeature } from "@/components/use-land-polygons";
import { ObjectDetail } from "@/components/object-detail";
import {
  formatElementAgeHours,
  formatUtcTimestamp,
  isStaleElementAge,
} from "@/lib/elements";
import { groundTrackSegments, type GroundTrackPoint } from "@/lib/ground-track";
import {
  propagateSatelliteAtUtc,
  type OrbitRegime,
  type SatellitePosition,
} from "@/lib/propagate";

const REGIME_COLORS: Record<OrbitRegime, string> = {
  LEO: "#f3c969",
  MEO: "#65d6ce",
  GEO: "#ff7d66",
  HEO: "#b7a6ff",
};
const SELECTED_COLOR = "#ffffff";
/* The object band sits along the foot of the view, so the sphere is nudged up
   to clear it rather than being faded out behind it. */
const GLOBE_LIFT_FRACTION = 0.07;
const LAND_COLOR = "#54666d";
const LAND_SIDE_COLOR = "#25373e";

const TRACK_COLOR = "rgba(243, 201, 105, 0.85)";

/** Fractions of the rendered globe radius. Objects are drawn far larger than
 *  scale so they can be seen and hit; the selected one is larger again. */
const OBJECT_RADIUS_FRACTION = 0.013;
const SELECTED_RADIUS_FRACTION = 0.024;

interface GlobeMaterialControls {
  color: { set: (color: string) => void };
  emissive: { set: (color: string) => void };
  emissiveIntensity: number;
  shininess: number;
}

function asSatellitePosition(point: object): SatellitePosition {
  return point as SatellitePosition;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function tooltipMarkup(point: object): string {
  const satellite = asSatellitePosition(point);
  const ageClass = isStaleElementAge(satellite.elementAgeHours) ? ' class="stale"' : "";

  return [
    '<div class="globe-tooltip">',
    `<strong>${escapeHtml(satellite.name)}</strong>`,
    `<span>NORAD ${escapeHtml(satellite.catalogNumber)}, ${escapeHtml(satellite.internationalDesignator)}</span>`,
    `<span>${satellite.regime}, ${Math.round(satellite.altitudeKm).toLocaleString("en-US")} km, ${satellite.velocityKmS.toFixed(2)} km/s</span>`,
    `<span${ageClass}>Orbit data age: ${formatElementAgeHours(satellite.elementAgeHours)}</span>`,
    "</div>",
  ].join("");
}

export function OrbitalGlobe() {
  const { records, selectedCatalogNumber, selectSatellite, preview } = useCatalog();
  const landFeatures = useLandPolygons();
  const landFeaturesRef = useRef<LandFeature[]>([]);
  const trackSegmentsRef = useRef<GroundTrackPoint[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const positionsRef = useRef<SatellitePosition[]>([]);
  // three-globe diffs its data by object identity. Handing it freshly built
  // position objects each tick made it destroy and rebuild every satellite once
  // a second, which is what flickered. These entries are kept and mutated in
  // place so the digest takes its update path and only moves them.
  const globeEntriesRef = useRef(new Map<string, SatellitePosition>());
  const selectedRef = useRef<string | null>(null);
  const [positions, setPositions] = useState<SatellitePosition[]>([]);
  const [observedAtUtc, setObservedAtUtc] = useState<Date | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [globeReady, setGlobeReady] = useState(false);

  // One geometry and one material per regime, shared by every mesh. Building
  // them per object would allocate hundreds of each on every tick.
  const meshParts = useMemo(() => {
    const geometry = new SphereGeometry(1, 10, 8);
    const materials = new Map<string, MeshBasicMaterial>();
    for (const [regime, color] of Object.entries(REGIME_COLORS)) {
      materials.set(regime, new MeshBasicMaterial({ color }));
    }
    materials.set("selected", new MeshBasicMaterial({ color: SELECTED_COLOR }));
    return { geometry, materials };
  }, []);

  useEffect(() => {
    const updatePositions = () => {
      const atUtc = preview?.atUtc ?? new Date();
      const nextPositions = records.flatMap((record) => {
        const position = propagateSatelliteAtUtc(record, atUtc);
        return position ? [position] : [];
      });
      positionsRef.current = nextPositions;
      setPositions(nextPositions);
      setObservedAtUtc(atUtc);

      const entries = globeEntriesRef.current;
      const present = new Set<string>();
      for (const position of nextPositions) {
        present.add(position.catalogNumber);
        const existing = entries.get(position.catalogNumber);
        if (existing) Object.assign(existing, position);
        else entries.set(position.catalogNumber, { ...position });
      }
      for (const catalogNumber of [...entries.keys()]) {
        if (!present.has(catalogNumber)) entries.delete(catalogNumber);
      }
      // A new array so the prop registers as changed; the same entries inside
      // so the objects themselves are only repositioned.
      globeRef.current?.objectsData([...entries.values()]);
    };

    updatePositions();
    if (preview) return;
    const intervalId = window.setInterval(updatePositions, 1_000);
    return () => window.clearInterval(intervalId);
  }, [records, preview]);

  // Before anything is clicked the panel falls back to the first object, so the
  // track has to resolve the same way or the globe and the panel disagree about
  // what is selected. Refresh the path every 30 seconds as Earth rotates,
  // independently of the one-second point updates.
  const activeCatalogNumber =
    selectedCatalogNumber ?? positions[0]?.catalogNumber ?? null;
  const [trackEpochMs, setTrackEpochMs] = useState(() => Date.now());
  useEffect(() => {
    if (preview) return;
    const timeoutId = window.setTimeout(() => setTrackEpochMs(Date.now()), 0);
    const intervalId = window.setInterval(() => setTrackEpochMs(Date.now()), 30_000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [preview]);

  const trackSegments = useMemo(() => {
    const record = records.find(
      (candidate) => candidate.catalogNumber === activeCatalogNumber,
    );
    return record ? groundTrackSegments(record, preview?.atUtc ?? new Date(trackEpochMs)) : [];
  }, [records, activeCatalogNumber, trackEpochMs, preview]);

  // Rebuilt whenever the selection changes: replacing this accessor is what
  // makes three-globe recreate the meshes with the new highlight.
  const buildObjectMesh = useCallback(
    (globe: GlobeInstance) => (point: object) => {
      const satellite = asSatellitePosition(point);
      const isSelected = satellite.catalogNumber === selectedRef.current;
      const mesh = new Mesh(meshParts.geometry);
      mesh.material =
        meshParts.materials.get(isSelected ? "selected" : satellite.regime) ??
        meshParts.materials.get("LEO")!;
      mesh.scale.setScalar(
        globe.getGlobeRadius() *
          (isSelected ? SELECTED_RADIUS_FRACTION : OBJECT_RADIUS_FRACTION),
      );
      return mesh;
    },
    [meshParts],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    const globeEntries = globeEntriesRef.current;

    void import("globe.gl")
      .then(({ default: Globe }) => {
        if (cancelled) return;

        // The canvas fills its box instead of being squared off inside it, so a
        // zoomed globe runs past the edges and is faded there rather than
        // meeting a hard cut. The sphere stays circular either way: the camera
        // field of view is vertical, so only the horizontal room changes.
        const width = Math.max(280, Math.floor(element.clientWidth));
        const height = Math.max(280, Math.floor(element.clientHeight || element.clientWidth));
        const globe = new Globe(element, {
          rendererConfig: { alpha: true, antialias: true },
        })
          .width(width)
          .height(height)
          .backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(true)
          .atmosphereColor("#4e8b9c")
          .atmosphereAltitude(0.16)
          .showGraticules(true)
          .polygonCapColor(() => LAND_COLOR)
          .polygonSideColor(() => LAND_SIDE_COLOR)
          .polygonStrokeColor(() => false)
          .polygonAltitude(0.008)
          .polygonCapCurvatureResolution(2)
          .polygonsTransitionDuration(0)
          .polygonsData(landFeaturesRef.current)
          .objectLat((point) => asSatellitePosition(point).latDeg)
          .objectLng((point) => asSatellitePosition(point).lngDeg)
          .objectAltitude(
            (point) => asSatellitePosition(point).displayAltitudeEarthRadii,
          )
          .objectLabel(tooltipMarkup)
          .onObjectClick((point) =>
            selectSatellite(asSatellitePosition(point).catalogNumber),
          )
          .onObjectHover((point) => {
            element.style.cursor = point ? "pointer" : "";
          })
          .pathPoints((segment) => segment as GroundTrackPoint[])
          .pathPointLat((point) => (point as GroundTrackPoint).latDeg)
          .pathPointLng((point) => (point as GroundTrackPoint).lngDeg)
          .pathPointAlt((point) => (point as GroundTrackPoint).displayAltitudeEarthRadii)
          .pathColor(() => TRACK_COLOR)
          .pathStroke(0.7)
          .pathDashLength(0.035)
          .pathDashGap(0.018)
          .pathTransitionDuration(0)
          .pathsData(trackSegmentsRef.current)
          .objectsData(positionsRef.current)
          .globeOffset([0, -Math.round(height * GLOBE_LIFT_FRACTION)])
          .pointOfView({ lat: 18, lng: -24, altitude: 2.25 });

        globe.objectThreeObject(buildObjectMesh(globe));

        const material = globe.globeMaterial() as unknown as GlobeMaterialControls;
        material.color.set("#102a35");
        material.emissive.set("#071118");
        material.emissiveIntensity = 0.7;
        material.shininess = 18;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        globe.controls().autoRotate = !reduceMotion;
        globe.controls().autoRotateSpeed = 0.32;
        globe.controls().enableDamping = true;
        globe.controls().dampingFactor = 0.08;
        globeRef.current = globe;
        setGlobeReady(true);

        // The globe is square and fits whichever side of its box is shorter, so
        // the whole sphere stays in view without the page scrolling.
        resizeObserver = new ResizeObserver(([entry]) => {
          const box = entry.contentRect;
          const nextWidth = Math.max(280, Math.floor(box.width));
          const nextHeight = Math.max(280, Math.floor(box.height));
          globe
            .width(nextWidth)
            .height(nextHeight)
            .globeOffset([0, -Math.round(nextHeight * GLOBE_LIFT_FRACTION)]);
        });
        resizeObserver.observe(element);
      })
      .catch(() => setRenderError("Could not load the globe. Try reloading the page."));

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      globeRef.current?._destructor();
      globeRef.current = null;
      globeEntries.clear();
    };
  }, [buildObjectMesh, selectSatellite]);

  useEffect(() => {
    selectedRef.current = activeCatalogNumber;
    const globe = globeRef.current;
    if (globe) {
      globe.objectThreeObject(buildObjectMesh(globe));
      const selected = positionsRef.current.find(
        (position) => position.catalogNumber === activeCatalogNumber,
      );
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      globe.controls().autoRotate = !preview && !reduceMotion;
      if (preview && window.matchMedia("(max-width: 899px)").matches) {
        viewportRef.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "instant" : "smooth" });
      }
      if (selected && (selectedCatalogNumber || preview)) {
        const transitionMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 650;
        globe.pointOfView(
          {
            lat: preview?.observer.latitudeDeg ?? selected.latDeg,
            lng: preview?.observer.longitudeDeg ?? selected.lngDeg,
            altitude: preview ? 2.25 : globe.pointOfView().altitude,
          },
          transitionMs,
        );
      }
    }
  }, [activeCatalogNumber, selectedCatalogNumber, buildObjectMesh, preview, globeReady]);

  useEffect(() => {
    trackSegmentsRef.current = trackSegments;
    globeRef.current?.pathsData(trackSegments);
  }, [trackSegments]);

  useEffect(() => {
    landFeaturesRef.current = landFeatures;
    globeRef.current?.polygonsData(landFeatures);
  }, [landFeatures]);

  return (
    <div className="orbital-stage">
      <div className="globe-viewport" ref={viewportRef}>
        <div className="globe-frame">
          <div
            className="globe-canvas"
            ref={containerRef}
            role="img"
            aria-label={`3D globe showing ${positions.length} tracked objects`}
          />
          {positions.length === 0 && !renderError ? (
            <p className="globe-status">Calculating positions…</p>
          ) : null}
          {renderError ? (
            <p className="globe-status globe-error">{renderError}</p>
          ) : null}
        </div>

        <div className="globe-rail">
        <aside className="orbit-key" aria-label="Orbit regime legend">
          <ul>
            {(Object.keys(REGIME_COLORS) as OrbitRegime[]).map((regime) => (
              <li key={regime}>
                <span style={{ backgroundColor: REGIME_COLORS[regime] }} />
                <b>{regime}</b>
                <small className="measure">
                  {positions.filter((position) => position.regime === regime).length}
                </small>
              </li>
            ))}
          </ul>
          <p className="drag-note">Drag to rotate. Select an object to see its path. {preview ? "Positions are paused at the preview time." : "Paths update every 30 seconds."} Heights are not to scale.</p>
        </aside>

          <p className="epoch-clock measure" aria-live="off">
            <span>{preview ? "Preview · UTC" : "UTC"}</span>
            {observedAtUtc ? formatUtcTimestamp(observedAtUtc) : "—"}
          </p>
        </div>
      </div>

      <ObjectDetail
        positions={positions}
        selectedCatalogNumber={activeCatalogNumber}
        onSelect={selectSatellite}
      />
    </div>
  );
}
