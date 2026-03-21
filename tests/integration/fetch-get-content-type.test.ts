/**
 * @module tests/integration/fetch-get-content-type.test
 *
 * LAYER: Integration
 * OWNS:  Request builder regressions for bodyless methods.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { buildFetchOptions } from "../../src/async/request.js";

test("buildFetchOptions omits Content-Type for GET/HEAD/DELETE without a body", () => {
  const getOpts = buildFetchOptions({ method: "GET" });
  const headOpts = buildFetchOptions({ method: "HEAD" });
  const deleteOpts = buildFetchOptions({ method: "DELETE" });

  assert.strictEqual(getOpts.headers, undefined);
  assert.strictEqual(headOpts.headers, undefined);
  assert.strictEqual(deleteOpts.headers, undefined);
});

test("buildFetchOptions still applies Content-Type when a body is present", () => {
  const postOpts = buildFetchOptions({ method: "POST", body: { ok: true } });
  const deleteWithBody = buildFetchOptions({ method: "DELETE", body: { ok: true } });

  assert.deepStrictEqual(postOpts.headers, { "Content-Type": "application/json" });
  assert.deepStrictEqual(deleteWithBody.headers, { "Content-Type": "application/json" });
});
