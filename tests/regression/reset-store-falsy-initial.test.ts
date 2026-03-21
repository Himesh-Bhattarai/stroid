/**
 * @module tests/regression/reset-store-falsy-initial.test
 *
 * LAYER: Tests
 * OWNS:  Regression coverage for resetStore() with falsy initial values.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, getStore, clearAllStores, resetStore, replaceStore } from "../../src/store.js";

test("resetStore restores falsy initial values instead of reporting not-found", () => {
  clearAllStores();

  createStore("flagReset", false);
  createStore("countReset", 0);
  createStore("emptyReset", "");
  createStore("nullReset", null);

  replaceStore("flagReset", true);
  replaceStore("countReset", 42);
  replaceStore("emptyReset", "value");
  replaceStore("nullReset", { changed: true });

  assert.deepStrictEqual(resetStore("flagReset"), { ok: true });
  assert.deepStrictEqual(resetStore("countReset"), { ok: true });
  assert.deepStrictEqual(resetStore("emptyReset"), { ok: true });
  assert.deepStrictEqual(resetStore("nullReset"), { ok: true });

  assert.strictEqual(getStore("flagReset"), false);
  assert.strictEqual(getStore("countReset"), 0);
  assert.strictEqual(getStore("emptyReset"), "");
  assert.strictEqual(getStore("nullReset"), null);
});
