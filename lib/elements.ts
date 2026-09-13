/**
 * Element set age accounting. TLE accuracy degrades within days, so age is
 * carried alongside every derived quantity rather than treated as metadata.
 * See SPEC section 9.
 */

/** Elements older than this are flagged wherever a result depends on them. */
export const STALE_ELEMENT_AGE_HOURS = 72;

export function elementAgeHoursAt(epochUtc: Date, atUtc: Date): number {
  return (atUtc.getTime() - epochUtc.getTime()) / 3_600_000;
}

export function isStaleElementAge(ageHours: number): boolean {
  return ageHours > STALE_ELEMENT_AGE_HOURS;
}

/** Renders an age with its unit attached, in hours up to two days and days beyond. */
export function formatElementAgeHours(ageHours: number): string {
  if (ageHours < 0) return `epoch in ${formatElementAgeHours(-ageHours)}`;
  if (ageHours < 48) return `${Math.round(ageHours)} h`;
  return `${(ageHours / 24).toFixed(1)} d`;
}

export function formatOffsetMinutes(atUtc: string, referenceUtc: string): string {
  const minutes = (Date.parse(atUtc) - Date.parse(referenceUtc)) / 60_000;
  return `${minutes > 0 ? "+" : minutes < 0 ? "−" : ""}${Math.abs(minutes).toFixed(1)} min`;
}

/** ISO-8601 UTC trimmed to seconds, e.g. "2026-09-12 14:03:22Z". */
export function formatUtcTimestamp(atUtc: Date): string {
  return atUtc.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}
