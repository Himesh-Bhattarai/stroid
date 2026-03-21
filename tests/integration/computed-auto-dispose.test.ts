/**
 * @module tests/integration/computed-auto-dispose.test
 *
 * LAYER: Integration
 * OWNS:  Regression coverage for computed autoDispose behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import "../../src/computed/index.js";
import { createStore, deleteStore, clearAllStores, getStore, hasStore } from "../../src/store.js";
import { createComputed, isComputedStore } from "../../src/computed/index.js";

test("createComputed autoDispose deletes the computed store after its last dependency is removed", () => {
  clearAllStores();
  createStore("autoDisposeA", { value: 1 });
  createStore("autoDisposeB", { value: 2 });
  createComputed(
    "autoDisposeSum",
    ["autoDisposeA", "autoDisposeB"],
    (a, b) => ((a as { value: number } | null)?.value ?? 0) + ((b as { value: number } | null)?.value ?? 0),
    { autoDispose: true }
  );

  assert.strictEqual(hasStore("autoDisposeSum"), true);
  assert.strictEqual(getStore("autoDisposeSum"), 3);

  deleteStore("autoDisposeA");
  assert.strictEqual(hasStore("autoDisposeSum"), true);
  assert.strictEqual(isComputedStore("autoDisposeSum"), true);

  deleteStore("autoDisposeB");
  assert.strictEqual(hasStore("autoDisposeSum"), false);
  assert.strictEqual(isComputedStore("autoDisposeSum"), false);
});
