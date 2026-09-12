"use client";

import type { GlobeInstance } from "globe.gl";
import { useEffect, useMemo, useRef, useState } from "react";

import fixture from "@/fixtures/satellites.json";
import {
  propagateTleAtUtc,
  type OrbitRegime,
  type SatellitePosition,
  type TleRecord,
} from "@/lib/propagate";

const REGIME_COLORS: Record<OrbitRegime, string> = {
  LEO: "#f3c969",
  MEO: "#65d6ce",
  GEO: "#ff7d66",
  HEO: "#b7a6ff",
};

interface GlobeMaterialControls {
  color: { set: (color: string) => void };
  emissive: { set: (color: string) => void };
  emissiveIntensity: number;
  shininess: number;
}

function asSatellitePosition(point: object): SatellitePosition {
  return point as SatellitePosition;
}

function tooltipMarkup(point: object): string {
  const satellite = asSatellitePosition(point);
  return `<div class="globe-tooltip"><strong>${satellite.name}</strong><span>${satellite.regime} · ${Math.round(satellite.altitudeKm).toLocaleString()} km</span></div>`;
}

export function OrbitalGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const positionsRef = useRef<SatellitePosition[]>([]);
  const records = useMemo(() => fixture as TleRecord[], []);
  const [positions, setPositions] = useState<SatellitePosition[]>([]);
  const [observedAtUtc, setObservedAtUtc] = useState<Date | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const updatePositions = () => {
      const atUtc = new Date();
      const nextPositions = records.flatMap((record) => {
        const position = propagateTleAtUtc(record, atUtc);
        return position ? [position] : [];
      });
      positionsRef.current = nextPositions;
      setPositions(nextPositions);
      setObservedAtUtc(atUtc);
    };

    updatePositions();
    const intervalId = window.setInterval(updatePositions, 1_000);
    return () => window.clearInterval(intervalId);
  }, [records]);

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
          .atmosphereAltitude(0.16)
          .showGraticules(true)
          .pointLat((point) => asSatellitePosition(point).latDeg)
          .pointLng((point) => asSatellitePosition(point).lngDeg)
          .pointAltitude(
            (point) => asSatellitePosition(point).displayAltitudeEarthRadii,
          )
          .pointColor((point) => REGIME_COLORS[asSatellitePosition(point).regime])
          .pointRadius(0.34)
          .pointResolution(12)
          .pointLabel(tooltipMarkup)
          .pointsTransitionDuration(700)
          .pointsData(positionsRef.current)
          .pointOfView({ lat: 18, lng: -24, altitude: 2.25 });

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

        resizeObserver = new ResizeObserver(([entry]) => {
          const nextSize = Math.max(320, Math.floor(entry.contentRect.width));
          globe.width(nextSize).height(nextSize);
        });
        resizeObserver.observe(element);
      })
      .catch(() => setRenderError("This browser could not start the 3D view."));

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      globeRef.current?._destructor();
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    globeRef.current?.pointsData(positions);
  }, [positions]);

  return (
    <div className="orbital-stage">
      <div className="globe-frame">
        <div
          className="globe-canvas"
          ref={containerRef}
          role="img"
          aria-label={`Rotatable 3D Earth showing ${positions.length} propagated space objects`}
        />
        {positions.length === 0 && !renderError ? (
          <p className="globe-status">Propagating orbits…</p>
        ) : null}
        {renderError ? <p className="globe-status globe-error">{renderError}</p> : null}
        <p className="utc-clock" aria-live="off">
          <span>Position epoch</span>
          {observedAtUtc
            ? observedAtUtc.toISOString().replace("T", " · ").slice(0, 22) + " UTC"
            : "—"}
        </p>
      </div>

      <aside className="orbit-key" aria-label="Orbit regime legend">
        <p>{positions.length.toString().padStart(2, "0")} objects in view</p>
        <ul>
          {(Object.keys(REGIME_COLORS) as OrbitRegime[]).map((regime) => (
            <li key={regime}>
              <span style={{ backgroundColor: REGIME_COLORS[regime] }} />
              <b>{regime}</b>
              <small>
                {positions.filter((position) => position.regime === regime).length}
              </small>
            </li>
          ))}
        </ul>
        <p className="drag-note">Drag to turn · scroll to inspect</p>
      </aside>
    </div>
  );
}
