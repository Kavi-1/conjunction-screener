"use client";

import { useEffect, useMemo, useState } from "react";

import { useCatalog } from "@/components/catalog-provider";
import {
  STALE_ELEMENT_AGE_HOURS,
  elementAgeHoursAt,
  formatElementAgeHours,
  isStaleElementAge,
} from "@/lib/elements";
import { elementEpochUtc } from "@/lib/propagate";

export function ElementReadout() {
  const { records } = useCatalog();
  const oldestEpochUtc = useMemo(
    () =>
      records
        .map(elementEpochUtc)
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
          <dt>Objects</dt>
          <dd className="measure">{records.length}</dd>
        </div>
        <div>
          <dt>Oldest orbit data</dt>
          <dd className="measure" data-stale={stale}>
            {ageHours === null ? "—" : formatElementAgeHours(ageHours)}
          </dd>
        </div>
        <div>
          <dt>Orbit model</dt>
          <dd className="measure">SGP4/SDP4</dd>
        </div>
      </dl>
      {stale ? (
        <p className="readout-note">
          Some orbit data is over {STALE_ELEMENT_AGE_HOURS} hours old.
          Positions may be off by kilometers.
        </p>
      ) : null}
    </>
  );
}
