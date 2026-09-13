import assert from "node:assert/strict";
import test from "node:test";
import { offlineCatalog } from "../lib/catalog-fallback.ts";

import {
  CATALOG_CACHE_SECONDS,
  celestrakCatalogUrl,
  classifyOrbitRegime,
  createCelestrakLoader,
  loadCatalogWithFallback,
  normalizeGpCatalog,
  normalizeGpRecord,
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
  assert.equal(requestedUrl, celestrakCatalogUrl("visual"));
  assert.match(requestedUserAgent, /Conjunction-Screener/);
  assert.equal(first, concurrent);
  assert.equal(first, second);
});

test("loader keeps active and visual groups explicit", async () => {
  let requestedUrl = "";
  const load = createCelestrakLoader({
    group: "active",
    fetcher: async (input) => {
      requestedUrl = String(input);
      return Response.json([gpRecord]);
    },
  });

  const catalog = await load();

  assert.equal(requestedUrl, celestrakCatalogUrl("active"));
  assert.equal(catalog.group, "active");
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

test("active catalog can fall back to an explicitly labeled visual scope", async () => {
  const visual = {
    source: "celestrak" as const,
    group: "visual" as const,
    fetchedAtUtc: "2026-09-12T12:00:00.000Z",
    stale: false,
    discardedRecords: 0,
    satellites: normalizeGpCatalog([gpRecord]).satellites,
  };
  const catalog = await loadCatalogWithFallback("active", {
    loadActive: async () => { throw new Error("Celestrak throttled ACTIVE"); },
    loadVisual: async () => visual,
  });

  assert.equal(catalog.group, "visual");
  assert.equal(catalog.fallbackFor, "active");
  assert.equal(catalog.satellites.length, 1);
});

test("unchanged-data 403 retains the cache without assuming a shared-IP copy is current", async () => {
  // Verbatim shape of the body Celestrak returns for a repeat request.
  const unchangedBody =
    "GP data has not updated since your last successful\n" +
    "download of GROUP=active at 2026-09-12 15:57:32 UTC.\n" +
    "Data is updated once every 2 hours.\n";
  let requestCount = 0;
  let unchanged = false;
  let nowMs = Date.parse("2026-09-12T12:00:00Z");
  const fetcher: typeof fetch = async () => {
    requestCount += 1;
    if (unchanged) return new Response(unchangedBody, { status: 403 });
    return Response.json([gpRecord]);
  };
  const load = createCelestrakLoader({ fetcher, now: () => nowMs });

  await load();
  unchanged = true;
  nowMs += CATALOG_CACHE_SECONDS * 1_000;

  const served = await load();
  assert.equal(served.stale, true);
  assert.equal(served.unchangedUpstream, true);
  assert.equal(served.satellites.length, 1);

  // Upstream said "stop asking", so the next call must not hit the network.
  const requestsBefore = requestCount;
  const repeated = await load();
  assert.equal(requestCount, requestsBefore);
  assert.equal(repeated.satellites.length, 1);
});

test("cold unchanged-data responses back off and permit an explicitly offline display", async () => {
  let requests = 0;
  const load = createCelestrakLoader({ fetcher: async () => {
    requests += 1;
    return new Response("GP data has not updated since your last successful download", { status: 403 });
  } });
  await assert.rejects(load(), /403/);
  await assert.rejects(load(), /403/);
  assert.equal(requests, 1);
  const fallback = offlineCatalog("active");
  assert.equal(fallback.offlineFixture, true);
  assert.equal(fallback.stale, true);
  assert.equal(fallback.fetchedAtUtc, null);
  assert.equal(fallback.satellites.length, 8);
});

test("optional names are allowed but malformed numbers, angles and duplicates are not", () => {
  const unnamed = normalizeGpRecord({ ...gpRecord, OBJECT_NAME: null, OBJECT_ID: null });
  assert.equal(unnamed?.name, "NORAD 48274");
  for (const value of [" ", false, [], {}]) assert.equal(normalizeGpRecord({ ...gpRecord, ECCENTRICITY: value }), null);
  assert.equal(normalizeGpRecord({ ...gpRecord, INCLINATION: 181 }), null);
  assert.equal(normalizeGpCatalog([gpRecord, gpRecord]).satellites.length, 1);
});

test("a genuine 403 block is still reported as stale rather than current", async () => {
  let blocked = false;
  let nowMs = Date.parse("2026-09-12T12:00:00Z");
  const fetcher: typeof fetch = async () => {
    if (blocked) return new Response("Forbidden", { status: 403 });
    return Response.json([gpRecord]);
  };
  const load = createCelestrakLoader({ fetcher, now: () => nowMs });

  await load();
  blocked = true;
  nowMs += CATALOG_CACHE_SECONDS * 1_000;

  const served = await load();
  assert.equal(served.stale, true);
  assert.equal(served.unchangedUpstream, undefined);
});

test("a missing numeric element is rejected, not read as zero", () => {
  const base = { ...gpRecord };
  for (const field of ["ECCENTRICITY", "INCLINATION", "BSTAR", "RA_OF_ASC_NODE"]) {
    assert.equal(
      normalizeGpRecord({ ...base, [field]: null }),
      null,
      `${field}: null was accepted`,
    );
    assert.equal(
      normalizeGpRecord({ ...base, [field]: "" }),
      null,
      `${field}: empty string was accepted`,
    );
  }
  assert.notEqual(normalizeGpRecord(base), null);
});
