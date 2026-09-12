import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_CACHE_SECONDS,
  CELESTRAK_VISUAL_URL,
  classifyOrbitRegime,
  createCelestrakLoader,
  normalizeGpCatalog,
} from "../lib/celestrak.ts";

const gpRecord = {
  OBJECT_NAME: "CSS (TIANHE)",
  OBJECT_ID: "2021-035A",
  EPOCH: "2026-09-12T03:38:29.096160",
  MEAN_MOTION: 15.59839597,
  ECCENTRICITY: 0.00026312,
  INCLINATION: 41.4683,
  RA_OF_ASC_NODE: 154.0266,
  ARG_OF_PERICENTER: 272.9242,
  MEAN_ANOMALY: 87.1296,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 48274,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 30674,
  BSTAR: 0.00021733307,
  MEAN_MOTION_DOT: 0.00017671,
  MEAN_MOTION_DDOT: 0,
};

test("current Celestrak JSON fields normalize into explicit units", () => {
  const catalog = normalizeGpCatalog([gpRecord, { OBJECT_NAME: "broken" }]);

  assert.equal(catalog.discardedRecords, 1);
  assert.equal(catalog.satellites[0]?.catalogNumber, "48274");
  assert.equal(catalog.satellites[0]?.epochUtc, "2026-09-12T03:38:29.096Z");
  assert.equal(catalog.satellites[0]?.meanMotionRevDay, 15.59839597);
  assert.equal(catalog.satellites[0]?.regime, "LEO");
});

test("orbit regimes are assigned from geometry and eccentricity", () => {
  assert.equal(classifyOrbitRegime(15.5, 0.001), "LEO");
  assert.equal(classifyOrbitRegime(2, 0.01), "MEO");
  assert.equal(classifyOrbitRegime(1.0027, 0.001), "GEO");
  assert.equal(classifyOrbitRegime(0.2, 0.5), "HEO");
});

test("loader uses the documented endpoint, identifies itself, and caches", async () => {
  let requestCount = 0;
  let requestedUrl = "";
  let requestedUserAgent = "";
  let nowMs = Date.parse("2026-09-12T12:00:00Z");
  const fetcher: typeof fetch = async (input, init) => {
    requestCount += 1;
    requestedUrl = String(input);
    requestedUserAgent = new Headers(init?.headers).get("User-Agent") ?? "";
    return Response.json([gpRecord]);
  };
  const load = createCelestrakLoader({ fetcher, now: () => nowMs });

  const [first, concurrent] = await Promise.all([load(), load()]);
  nowMs += (CATALOG_CACHE_SECONDS - 1) * 1_000;
  const second = await load();

  assert.equal(requestCount, 1);
  assert.equal(requestedUrl, CELESTRAK_VISUAL_URL);
  assert.match(requestedUserAgent, /Miss-Distance/);
  assert.equal(first, concurrent);
  assert.equal(first, second);
});

test("loader serves the last catalog stale after an upstream error", async () => {
  let shouldFail = false;
  let nowMs = Date.parse("2026-09-12T12:00:00Z");
  const fetcher: typeof fetch = async () => {
    if (shouldFail) return new Response("blocked", { status: 403 });
    return Response.json([gpRecord]);
  };
  const load = createCelestrakLoader({ fetcher, now: () => nowMs });

  await load();
  shouldFail = true;
  nowMs += CATALOG_CACHE_SECONDS * 1_000;

  assert.equal((await load()).stale, true);
});
