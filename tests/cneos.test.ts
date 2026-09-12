import assert from "node:assert/strict";
import test from "node:test";

import {
  CNEOS_CAD_URL,
  createCneosLoader,
  normalizeCadResponse,
} from "../lib/cneos.ts";

const response = {
  signature: { source: "NASA/JPL SBDB Close Approach Data API", version: "1.5" },
  count: 1,
  fields: ["fullname", "v_rel", "dist_max", "cd", "des", "diameter", "orbit_id", "dist", "dist_min", "t_sigma_f", "diameter_sigma"],
  data: [[" 99942 Apophis (2004 MN4)", "7.42249308586014", "0.000254112343772129", "2029-Apr-13 21:46", "99942", "0.34", "206", "0.000254099098170977", "0.000254085852623379", "< 00:01", "0.04"]],
};

test("CAD rows normalize by field name rather than fixed position", () => {
  const [approach] = normalizeCadResponse(response);

  assert.equal(approach.name, "99942 Apophis (2004 MN4)");
  assert.equal(approach.tcaTdb, "2029-Apr-13 21:46");
  assert.ok(Math.abs(approach.relativeVelocityKmS - 7.42249308586014) < 1e-12);
  assert.ok(approach.missDistanceKm > 38_000 && approach.missDistanceKm < 39_000);
  assert.equal(approach.diameterKm, 0.34);
});

test("CAD parser accepts a documented zero-count response", () => {
  assert.deepEqual(normalizeCadResponse({ signature: { version: "1.5" }, count: 0 }), []);
});

test("JPL loader uses the documented query and caches responses", async () => {
  let requests = 0;
  let requestedUrl = "";
  const load = createCneosLoader({
    fetcher: async (input) => {
      requests += 1;
      requestedUrl = String(input);
      return Response.json(response);
    },
  });

  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(requests, 1);
  assert.equal(requestedUrl, CNEOS_CAD_URL);
  assert.equal(first, second);
  assert.equal(first.apiVersion, "1.5");
});
