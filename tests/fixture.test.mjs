import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL("../fixtures/satellites.json", import.meta.url);
const satellites = JSON.parse(await readFile(fixtureUrl, "utf8"));

test("offline fixture contains each displayed orbit regime", () => {
  assert.deepEqual(
    [...new Set(satellites.map(({ regime }) => regime))].sort(),
    ["GEO", "HEO", "LEO", "MEO"],
  );
});

test("offline fixture contains valid-looking two-line elements", () => {
  assert.ok(satellites.length > 0);

  for (const satellite of satellites) {
    assert.match(satellite.catalogNumber, /^\d{5}$/);
    assert.equal(satellite.line1.length, 69);
    assert.equal(satellite.line2.length, 69);
    assert.equal(satellite.line1.slice(2, 7), satellite.catalogNumber);
    assert.equal(satellite.line2.slice(2, 7), satellite.catalogNumber);
  }
});
