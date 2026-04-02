/**
 * @module tests/regression/async-cache-cleanups
 *
 * LAYER: Regression
 * OWNS:  Async cache cleanup buckets cannot be keyed by prototype keys.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { getStoreCleanups, registerStoreCleanup, unregisterStoreCleanup } from "../../src/async/cache.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("registerStoreCleanup normalizes kind to avoid prototype keys", () => {
  resetAllStoresForTest();
  const cleanup = () => {};

  registerStoreCleanup("cleanupProto", cleanup, "__proto__" as any);

  const bucket = getStoreCleanups()["cleanupProto"];
  assert.ok(bucket);
  assert.ok(bucket.store instanceof Set);
  assert.strictEqual((bucket as any).__proto__, undefined);

  unregisterStoreCleanup("cleanupProto", cleanup, "__proto__" as any);
  assert.strictEqual(getStoreCleanups()["cleanupProto"], undefined);
});
