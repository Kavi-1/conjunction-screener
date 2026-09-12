import assert from "node:assert/strict";
import test from "node:test";

import {
  STALE_ELEMENT_AGE_HOURS,
  elementAgeHoursAt,
  formatElementAgeHours,
  formatUtcTimestamp,
  isStaleElementAge,
} from "../lib/elements.ts";

test("element age is measured in hours between two UTC instants", () => {
  const epoch = new Date("2026-09-10T00:00:00Z");
  const now = new Date("2026-09-11T06:00:00Z");

  assert.equal(elementAgeHoursAt(epoch, now), 30);
});

test("staleness is decided by the documented threshold", () => {
  assert.equal(isStaleElementAge(STALE_ELEMENT_AGE_HOURS - 1), false);
  assert.equal(isStaleElementAge(STALE_ELEMENT_AGE_HOURS + 1), true);
});

test("age formatting switches from hours to days and keeps its unit", () => {
  assert.equal(formatElementAgeHours(-3), "0 h");
  assert.equal(formatElementAgeHours(14.4), "14 h");
  assert.equal(formatElementAgeHours(96), "4.0 d");
});

test("timestamps render as ISO-8601 UTC trimmed to seconds", () => {
  assert.equal(
    formatUtcTimestamp(new Date("2026-09-12T14:03:22.461Z")),
    "2026-09-12 14:03:22Z",
  );
});
