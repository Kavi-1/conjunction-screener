"use client";

import type { GlobeInstance } from "globe.gl";
import { useEffect, useRef, useState } from "react";

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

function asPosition(point: object): SatellitePosition {
  return point as SatellitePosition;
}

export function ReplayGlobe({ records, atUtc }: ReplayGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const positionsRef = useRef<SatellitePosition[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    positionsRef.current = records.flatMap((record) => {
      const position = propagateSatelliteAtUtc(record, atUtc);
      return position ? [position] : [];
    });
    globeRef.current?.pointsData(positionsRef.current);
  }, [atUtc, records]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    void import("globe.gl")
      .then(({ default: Globe }) => {
        if (cancelled) return;
        const size = Math.max(320, element.clientWidth);
        const globe = new Globe(element, {
          rendererConfig: { alpha: true, antialias: true },
        })
          .width(size)
          .height(size)
          .backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(true)
          .atmosphereColor("#4e8b9c")
          .atmosphereAltitude(0.13)
          .showGraticules(true)
          .pointLat((point) => asPosition(point).latDeg)
          .pointLng((point) => asPosition(point).lngDeg)
          .pointAltitude(0.035)
          .pointColor((point) =>
            asPosition(point).catalogNumber === "24946" ? "#f3c969" : "#ff9a87"
          )
          .pointRadius(0.7)
          .pointResolution(16)
          .pointLabel((point) => asPosition(point).name)
          .pointsTransitionDuration(60)
          .pointsData(positionsRef.current)
          .pointOfView({ lat: 72.5, lng: 97.9, altitude: 0.72 });

        const material = globe.globeMaterial() as unknown as GlobeMaterialControls;
        material.color.set("#102a35");
        material.emissive.set("#071118");
        material.emissiveIntensity = 0.7;
        material.shininess = 18;
        globe.controls().autoRotate = false;
        globe.controls().enableDamping = true;
        globeRef.current = globe;

        resizeObserver = new ResizeObserver(([entry]) => {
          const nextSize = Math.max(320, Math.floor(entry.contentRect.width));
          globe.width(nextSize).height(nextSize);
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
  }, []);

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
