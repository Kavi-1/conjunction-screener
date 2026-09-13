import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogClient, CATALOG_RETRY_MS } from "../lib/catalog-client.ts";
import { offlineCatalog } from "../lib/catalog-fallback.ts";
import { CATALOG_CACHE_SECONDS } from "../lib/celestrak.ts";

// Simulate a successful transport using the repository's real orbital fixture.
const downloaded = {
  ...offlineCatalog("visual"),
  offlineFixture: false,
  stale: false,
  fetchedAtUtc: "2026-09-13T14:22:47.730Z",
};

test("an offline response expires quickly and recovers without a reload", async () => {
  let nowMs = 0;
  let requests = 0;
  const load = createCatalogClient(async () => {
    requests += 1;
    return Response.json(requests === 1 ? offlineCatalog("visual") : downloaded);
  }, () => nowMs);
  assert.equal((await load()).offlineFixture, true);
  nowMs = CATALOG_RETRY_MS - 1;
  assert.equal((await load()).offlineFixture, true);
  assert.equal(requests, 1);
  nowMs += 1;
  assert.equal((await load()).offlineFixture, false);
  assert.equal(requests, 2);
});

test("successful catalogs keep the two-hour cache and concurrent requests share a fetch", async () => {
  let requests = 0;
  let nowMs = 0;
  const load = createCatalogClient(async () => {
    requests += 1;
    return Response.json(downloaded);
  }, () => nowMs);
  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(first, second);
  nowMs = CATALOG_CACHE_SECONDS * 1_000 - 1;
  await load();
  assert.equal(requests, 1);
  nowMs += 1;
  await load();
  assert.equal(requests, 2);
});

test("manual retry bypasses the browser fallback cache", async () => {
  let requests = 0;
  const load = createCatalogClient(async () => Response.json(
    ++requests === 1 ? offlineCatalog("visual") : downloaded,
  ));
  await load();
  assert.equal((await load(true)).offlineFixture, false);
});

test("an offline or failed refresh preserves downloaded data with its age and marks it stale", async () => {
  for (const response of [() => Response.json(offlineCatalog("visual")),
    () => new Response("unavailable", { status: 502 })]) {
    let requests = 0;
    const load = createCatalogClient(async () => ++requests === 1
      ? Response.json(downloaded) : response());
    const first = await load();
    const cached = await load(true);
    assert.equal(cached.offlineFixture, false);
    assert.equal(cached.stale, true);
    assert.equal(cached.fetchedAtUtc, first.fetchedAtUtc);
    assert.deepEqual(cached.satellites, first.satellites);
  }
});

test("a failed first request does not poison subsequent retries", async () => {
  let requests = 0;
  const load = createCatalogClient(async () => ++requests === 1
    ? new Response("unavailable", { status: 502 }) : Response.json(downloaded));
  await assert.rejects(load(), /502/);
  assert.equal((await load()).offlineFixture, false);
});
