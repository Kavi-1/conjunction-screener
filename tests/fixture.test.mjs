import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyOrbitRegime } from "../lib/celestrak.ts";

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
    assert.equal(satellite.regime, classifyOrbitRegime(Number(satellite.line2.slice(52, 63)), Number(`0.${satellite.line2.slice(26, 33).trim()}`)));
    for (const line of [satellite.line1, satellite.line2]) {
      const checksum = [...line.slice(0, 68)].reduce((sum, char) => sum + (/\d/.test(char) ? Number(char) : char === "-" ? 1 : 0), 0) % 10;
      assert.equal(checksum, Number(line[68]));
    }
  }
});
