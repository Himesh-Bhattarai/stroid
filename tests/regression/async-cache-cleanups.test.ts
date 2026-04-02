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

  const bucket = getStoreCleanups().get("cleanupProto");
  assert.ok(bucket);
  assert.ok(bucket.store instanceof Set);
  assert.strictEqual((bucket as any).__proto__, undefined);

  unregisterStoreCleanup("cleanupProto", cleanup, "__proto__" as any);
  assert.strictEqual(getStoreCleanups().get("cleanupProto"), undefined);
});

test("registerStoreCleanup does not prototype-pollute via store name", () => {
  resetAllStoresForTest();
  const cleanup = () => {};

  registerStoreCleanup("__proto__", cleanup, "store");

  const bucket = getStoreCleanups().get("__proto__");
  assert.ok(bucket);
  assert.ok(bucket.store instanceof Set);

  // If cleanup tracking were implemented on a normal object with "__proto__" keys,
  // this would show up as a polluted prototype property.
  assert.strictEqual(({} as any).store, undefined);

  unregisterStoreCleanup("__proto__", cleanup, "store");
  assert.strictEqual(getStoreCleanups().get("__proto__"), undefined);
});
