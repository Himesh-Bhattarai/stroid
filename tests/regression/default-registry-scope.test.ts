/**
 * @module tests/regression/default-registry-scope.test
 *
 * LAYER: Tests
 * OWNS:  Regression coverage for the bundler-safe default registry scope key.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  defaultRegistryScope,
  getDefaultStoreRegistry,
  normalizeStoreRegistryScope,
} from "../../src/core/store-registry.js";

test("default registry scope uses a stable bundler-safe key", () => {
  assert.strictEqual(defaultRegistryScope, "stroid:default-registry");
  assert.strictEqual(
    normalizeStoreRegistryScope("stroid:default-registry"),
    "stroid:default-registry"
  );
  assert.ok(getDefaultStoreRegistry());
});
