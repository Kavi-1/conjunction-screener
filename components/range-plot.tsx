import type { ConjunctionResult } from "@/lib/screen";
import { formatOffsetMinutes } from "@/lib/elements";

interface RangePlotProps {
  result: ConjunctionResult;
}

const WIDTH = 720;
const HEIGHT = 260;
const PADDING = 34;

export function RangePlot({ result }: RangePlotProps) {
  const samples = result.rangeSeries;
  const firstMs = Date.parse(samples[0]?.atUtc ?? result.tcaUtc);
  const lastMs = Date.parse(samples.at(-1)?.atUtc ?? result.tcaUtc);
  const maximumKm = Math.max(...samples.map((sample) => sample.rangeKm), 1);
  const plotWidth = WIDTH - PADDING * 2;
  const plotHeight = HEIGHT - PADDING * 2;
  const x = (atUtc: string) =>
    PADDING +
    ((Date.parse(atUtc) - firstMs) / Math.max(1, lastMs - firstMs)) * plotWidth;
  const y = (rangeKm: number) =>
    HEIGHT - PADDING - (rangeKm / maximumKm) * plotHeight;
  const path = samples
    .map((sample, index) => `${index === 0 ? "M" : "L"}${x(sample.atUtc)},${y(sample.rangeKm)}`)
    .join(" ");
  const tcaX = x(result.tcaUtc);

  return (
    <figure className="range-figure">
      <figcaption>
        <strong>
          {result.first.name} <span className="measure">{result.first.catalogNumber}</span>
        </strong>
        <strong>
          {result.second.name} <span className="measure">{result.second.catalogNumber}</span>
        </strong>
        <span>Predicted separation (SGP4).</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
        <title>
          Predicted separation over time. Minimum: {result.missDistanceKm.toFixed(2)} kilometers.
        </title>
        <line className="plot-axis" x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} />
        <line className="plot-axis" x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} />
        <line className="plot-tca" x1={tcaX} y1={PADDING} x2={tcaX} y2={HEIGHT - PADDING} />
        <path className="plot-range" d={path} />
        <circle className="plot-point" cx={tcaX} cy={y(result.missDistanceKm)} r="4" />
        <text x={PADDING} y={HEIGHT - 9}>{formatOffsetMinutes(new Date(firstMs).toISOString(), result.tcaUtc)}</text>
        <text textAnchor="middle" x={Math.max(PADDING + 15, Math.min(WIDTH - PADDING - 15, tcaX))} y={PADDING - 8}>TCA</text>
        <text textAnchor="end" x={WIDTH - PADDING} y={HEIGHT - 9}>{formatOffsetMinutes(new Date(lastMs).toISOString(), result.tcaUtc)}</text>
        <text x={PADDING + 6} y={PADDING + 13}>{maximumKm.toFixed(0)} km</text>
        <text x={PADDING + 6} y={HEIGHT - PADDING - 7}>0 km</text>
      </svg>
    </figure>
  );
}
