import { formatElementAgeHours, formatUtcTimestamp, isStaleElementAge } from "@/lib/elements";
import type { ConjunctionResult } from "@/lib/screen";

interface ApproachTableProps {
  results: ConjunctionResult[];
  selectedId: string | null;
  onSelect: (result: ConjunctionResult) => void;
}

export function ApproachTable({ results, selectedId, onSelect }: ApproachTableProps) {
  return (
    <div className="approach-table-wrap">
      <table className="approach-table">
        <thead>
          <tr>
            <th scope="col">Objects</th>
            <th scope="col">Closest approach (UTC)</th>
            <th scope="col">Miss distance</th>
            <th scope="col">Relative velocity</th>
            <th scope="col">Oldest elements</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const stale = isStaleElementAge(result.oldestElementAgeHours);
            return (
              <tr key={result.id} data-selected={selectedId === result.id}>
                <th scope="row">
                  <button type="button" onClick={() => onSelect(result)}>
                    {result.first.name}
                    <span>
                      {result.first.catalogNumber} / {result.second.name} {result.second.catalogNumber}
                    </span>
                  </button>
                </th>
                <td className="measure">{formatUtcTimestamp(new Date(result.tcaUtc))}</td>
                <td className="measure">{result.missDistanceKm.toFixed(2)} km</td>
                <td className="measure">{result.relativeVelocityKmS.toFixed(2)} km/s</td>
                <td className="measure" data-stale={stale}>
                  {formatElementAgeHours(result.oldestElementAgeHours)}{stale ? " · stale" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
