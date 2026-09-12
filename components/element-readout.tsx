"use client";

import { useEffect, useMemo, useState } from "react";

import fixture from "@/fixtures/satellites.json";
import {
  STALE_ELEMENT_AGE_HOURS,
  elementAgeHoursAt,
  formatElementAgeHours,
  isStaleElementAge,
} from "@/lib/elements";
import { tleEpochUtc, type TleRecord } from "@/lib/propagate";

export function ElementReadout() {
  const records = useMemo(() => fixture as TleRecord[], []);
  const oldestEpochUtc = useMemo(
    () =>
      records
        .map((record) => tleEpochUtc(record.line1))
        .reduce((oldest, epoch) => (epoch < oldest ? epoch : oldest)),
    [records],
  );

  // Age depends on the reader's clock, so it resolves after mount and leaves
  // the server and client markup identical.
  const [ageHours, setAgeHours] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setAgeHours(elementAgeHoursAt(oldestEpochUtc, new Date()));
    update();
    const intervalId = window.setInterval(update, 60_000);
    return () => window.clearInterval(intervalId);
  }, [oldestEpochUtc]);

  const stale = ageHours !== null && isStaleElementAge(ageHours);

  return (
    <>
      <dl className="readout">
        <div>
          <dt>Objects tracked</dt>
          <dd className="measure">{records.length}</dd>
        </div>
        <div>
          <dt>Oldest element set</dt>
          <dd className="measure" data-stale={stale}>
            {ageHours === null ? "—" : formatElementAgeHours(ageHours)}
          </dd>
        </div>
        <div>
          <dt>Propagation model</dt>
          <dd className="measure">SGP4/SDP4</dd>
        </div>
        <div>
          <dt>Position update</dt>
          <dd className="measure">1 Hz</dd>
        </div>
      </dl>
      {stale ? (
        <p className="readout-note">
          These element sets are more than {STALE_ELEMENT_AGE_HOURS} hours old. Positions
          drawn from them can be wrong by kilometers.
        </p>
      ) : null}
    </>
  );
}
