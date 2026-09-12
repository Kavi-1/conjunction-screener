export interface ApproachTableRow {
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
  tcaLabel: string;
  missDistanceLabel: string;
  relativeVelocityLabel: string;
  auxiliaryLabel: string;
  auxiliaryAlert?: boolean;
}

interface ApproachTableProps {
  rows: ApproachTableRow[];
  selectedId: string | null;
  tcaHeading: string;
  auxiliaryHeading: string;
  onSelect: (row: ApproachTableRow) => void;
}

export function ApproachTable({
  rows,
  selectedId,
  tcaHeading,
  auxiliaryHeading,
  onSelect,
}: ApproachTableProps) {
  return (
    <div className="approach-table-wrap">
      <table className="approach-table">
        <thead>
          <tr>
            <th scope="col">Objects</th>
            <th scope="col">{tcaHeading}</th>
            <th scope="col">Miss distance</th>
            <th scope="col">Relative velocity</th>
            <th scope="col">{auxiliaryHeading}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
              <tr key={row.id} data-selected={selectedId === row.id}>
                <th scope="row">
                  <button type="button" onClick={() => onSelect(row)}>
                    {row.primaryLabel}
                    <span>{row.secondaryLabel}</span>
                  </button>
                </th>
                <td className="measure">{row.tcaLabel}</td>
                <td className="measure">{row.missDistanceLabel}</td>
                <td className="measure">{row.relativeVelocityLabel}</td>
                <td className="measure" data-stale={row.auxiliaryAlert}>
                  {row.auxiliaryLabel}
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
