/**
 * @module tests/regression/assert-runtime-clear.test
 *
 * LAYER: Regression
 * OWNS:  Regression coverage for clearAllStores under assertRuntime.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore, hasStore } from "../../src/store.js";
import { configureStroid, resetConfig } from "../../src/config.js";

test("clearAllStores succeeds under assertRuntime when no warning is emitted", () => {
  resetConfig();
  clearAllStores();
  createStore("assertRuntimeClear", { value: 1 });
  configureStroid({ assertRuntime: true });

  try {
    assert.doesNotThrow(() => {
      clearAllStores();
    });
    assert.strictEqual(hasStore("assertRuntimeClear"), false);
  } finally {
    resetConfig();
    clearAllStores();
  }
});
