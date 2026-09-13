"use client";

import type { GlobeInstance } from "globe.gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";

import { useLandPolygons, type LandFeature } from "@/components/use-land-polygons";
import { formatUtcTimestamp } from "@/lib/elements";
import {
  propagateSatelliteAtUtc,
  type SatellitePosition,
  type TleRecord,
} from "@/lib/propagate";

interface ReplayGlobeProps {
  records: TleRecord[];
  atUtc: Date;
}

interface GlobeMaterialControls {
  color: { set: (color: string) => void };
  emissive: { set: (color: string) => void };
  emissiveIntensity: number;
  shininess: number;
}

const IRIDIUM_CATALOG_NUMBER = "24946";
const IRIDIUM_COLOR = "#f3c969";
const COSMOS_COLOR = "#ff9a87";
/** Fraction of the rendered globe radius. Far above scale, so both objects read. */
const OBJECT_RADIUS_FRACTION = 0.013;
const LAND_COLOR = "#54666d";
const LAND_SIDE_COLOR = "#25373e";


function asPosition(point: object): SatellitePosition {
  return point as SatellitePosition;
}

export function ReplayGlobe({ records, atUtc }: ReplayGlobeProps) {
  const landFeatures = useLandPolygons();
  const landFeaturesRef = useRef<LandFeature[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const positionsRef = useRef<SatellitePosition[]>([]);
  // Same reason as the main globe: identity-stable entries so the digest moves
  // the two objects instead of rebuilding them on every animation frame.
  const globeEntriesRef = useRef(new Map<string, SatellitePosition>());
  const [renderError, setRenderError] = useState<string | null>(null);
  const meshParts = useMemo(() => ({
    geometry: new SphereGeometry(1, 12, 10),
    iridium: new MeshBasicMaterial({ color: IRIDIUM_COLOR }),
    cosmos: new MeshBasicMaterial({ color: COSMOS_COLOR }),
  }), []);

  useEffect(() => {
    positionsRef.current = records.flatMap((record) => {
      const position = propagateSatelliteAtUtc(record, atUtc);
      return position ? [position] : [];
    });

    const entries = globeEntriesRef.current;
    for (const position of positionsRef.current) {
      const existing = entries.get(position.catalogNumber);
      if (existing) Object.assign(existing, position);
      else entries.set(position.catalogNumber, { ...position });
    }
    globeRef.current?.objectsData([...entries.values()]);
  }, [atUtc, records]);

  useEffect(() => {
    landFeaturesRef.current = landFeatures;
    globeRef.current?.polygonsData(landFeatures);
  }, [landFeatures]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

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
          .atmosphereAltitude(0.13)
          .showGraticules(true)
          .polygonCapColor(() => LAND_COLOR)
          .polygonSideColor(() => LAND_SIDE_COLOR)
          .polygonStrokeColor(() => false)
          .polygonAltitude(0.008)
          .polygonCapCurvatureResolution(2)
          .polygonsTransitionDuration(0)
          .polygonsData(landFeaturesRef.current)
          .objectLat((point) => asPosition(point).latDeg)
          .objectLng((point) => asPosition(point).lngDeg)
          .objectAltitude(0.035)
          .objectThreeObject((point) => {
            const satellite = asPosition(point);
            const mesh = new Mesh(meshParts.geometry);
            mesh.material =
              satellite.catalogNumber === IRIDIUM_CATALOG_NUMBER
                ? meshParts.iridium
                : meshParts.cosmos;
            mesh.scale.setScalar(globe.getGlobeRadius() * OBJECT_RADIUS_FRACTION);
            return mesh;
          })
          .objectLabel((point) => asPosition(point).name)
          .objectsData(positionsRef.current)
          .pointOfView({ lat: 72.5, lng: 97.9, altitude: 1.75 });

        const material = globe.globeMaterial() as unknown as GlobeMaterialControls;
        material.color.set("#102a35");
        material.emissive.set("#071118");
        material.emissiveIntensity = 0.7;
        material.shininess = 18;
        globe.controls().autoRotate = false;
        globe.controls().enableDamping = true;
        globeRef.current = globe;

        resizeObserver = new ResizeObserver(([entry]) => {
          const box = entry.contentRect;
          const nextWidth = Math.max(280, Math.floor(box.width));
          const nextHeight = Math.max(280, Math.floor(box.height));
          globe.width(nextWidth).height(nextHeight);
        });
        resizeObserver.observe(element);
      })
      .catch(() => setRenderError("This browser could not start the replay globe."));

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      globeRef.current?._destructor();
      globeRef.current = null;
    };
  }, [meshParts]);

  return (
    <div className="replay-globe-frame">
      <div
        className="globe-canvas"
        ref={containerRef}
        role="img"
        aria-label="Iridium 33 and Cosmos 2251 approaching over northern Siberia"
      />
      {renderError && <p className="globe-status globe-error">{renderError}</p>}
      <p className="replay-clock measure">{formatUtcTimestamp(atUtc)}</p>
      <div className="replay-key" aria-label="Replay object key">
        <span><i data-object="iridium" />Iridium 33</span>
        <span><i data-object="cosmos" />Cosmos 2251</span>
      </div>
    </div>
  );
}
