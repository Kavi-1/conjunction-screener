"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ReplayGlobe } from "@/components/replay-globe";
import collisionFixture from "@/fixtures/iridium-cosmos-2009.json";
import { formatUtcTimestamp } from "@/lib/elements";
import { createSatellitePropagator, type TleRecord } from "@/lib/propagate";
import {
  computeCollisionValidation,
  type CollisionReplayFixture,
} from "@/lib/replay";

const fixture = collisionFixture as CollisionReplayFixture;
const validation = computeCollisionValidation(fixture);
const records = fixture.satellites as TleRecord[];
const startMs = Date.parse(fixture.replayStartUtc);
const endMs = Date.parse(fixture.replayEndUtc);
const durationSeconds = (endMs - startMs) / 1_000;
const PLAYBACK_RATE = 36;

export function CollisionReplay() {
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const previousFrameRef = useRef<number | null>(null);
  const propagators = useMemo(
    () => records.map(createSatellitePropagator),
    [],
  );
  const atUtc = new Date(startMs + offsetSeconds * 1_000);
  const firstState = propagators[0]?.(atUtc);
  const secondState = propagators[1]?.(atUtc);
  const currentRangeKm = firstState && secondState
    ? Math.hypot(
        firstState.positionEciKm.x - secondState.positionEciKm.x,
        firstState.positionEciKm.y - secondState.positionEciKm.y,
        firstState.positionEciKm.z - secondState.positionEciKm.z,
      )
    : null;

  useEffect(() => {
    if (!playing) {
      previousFrameRef.current = null;
      return;
    }
    let frameId = 0;
    const advance = (timestamp: number) => {
      const previous = previousFrameRef.current ?? timestamp;
      previousFrameRef.current = timestamp;
      setOffsetSeconds((current) => {
        const next = Math.min(
          durationSeconds,
          current + ((timestamp - previous) / 1_000) * PLAYBACK_RATE,
        );
        if (next >= durationSeconds) {
          setPlaying(false);
          setCompleted(true);
        }
        return next;
      });
      frameId = window.requestAnimationFrame(advance);
    };
    frameId = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frameId);
  }, [playing]);

  function togglePlayback() {
    if (offsetSeconds >= durationSeconds) {
      setOffsetSeconds(0);
      setCompleted(false);
    }
    setPlaying((current) => !current);
  }

  return (
    <section className="replay-workspace">
      <ReplayGlobe records={records} atUtc={atUtc} />
      <div className="replay-console">
        <div className="replay-controls">
          <button type="button" onClick={togglePlayback}>{playing ? "Pause" : "Play replay"}</button>
          <button type="button" onClick={() => { setPlaying(false); setOffsetSeconds(0); setCompleted(false); }}>Reset</button>
          <label>
            <span>Replay time</span>
            <input
              type="range"
              min="0"
              max={durationSeconds}
              step="0.1"
              value={offsetSeconds}
              onChange={(event) => {
                const next = Number(event.target.value);
                setOffsetSeconds(next);
                setCompleted(next >= durationSeconds);
              }}
            />
          </label>
        </div>
        <dl className="replay-readout">
          <div><dt>Separation now</dt><dd className="measure">{currentRangeKm?.toFixed(2) ?? "—"} km</dd></div>
          <div><dt>Computed closest approach</dt><dd className="measure">{formatUtcTimestamp(new Date(validation.computedTcaUtc))}</dd></div>
          <div><dt>Computed miss distance</dt><dd className="measure">{validation.missDistanceKm.toFixed(3)} km</dd></div>
          <div><dt>Relative velocity</dt><dd className="measure">{validation.relativeVelocityKmS.toFixed(3)} km/s</dd></div>
        </dl>
        {completed && (
          <div className="replay-verdict" aria-live="polite">
            <p>The replay has passed the event.</p>
            <strong className="measure">
              Computed TCA delta: {validation.deltaSeconds >= 0 ? "+" : ""}{validation.deltaSeconds.toFixed(3)} s
            </strong>
            <span>
              The public elements match Celestrak’s documented SOCRATES time but
              predict a 0.708 km miss, illustrating their uncertainty.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
