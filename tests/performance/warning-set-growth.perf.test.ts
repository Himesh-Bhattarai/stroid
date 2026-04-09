/**
 * @module tests/performance/warning-set-growth
 *
 * LAYER: Performance
 * OWNS:  Warning dedupe set growth bounds across create/delete churn.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createStore, deleteStore } from "../../src/store.js";
import { fetchStore } from "../../src/async.js";
import { getWarnedOnce } from "../../src/async/cache.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const makeAsyncShape = () => ({
  data: null,
  loading: false,
  error: null,
  status: "idle" as const,
});

test("async warning sets are released on delete and stay bounded across waves", async () => {
  resetAllStoresForTest();

  const warned = getWarnedOnce();
  const firstWave = 300;

  for (let i = 0; i < firstWave; i += 1) {
    const name = `warn-wave-a-${i}`;
    createStore(name, makeAsyncShape());
    await fetchStore(name, Promise.resolve({ value: i }), { dedupe: false });
    deleteStore(name);
  }

  assert.strictEqual(warned.get("noSignal")?.size ?? 0, 0);
  assert.strictEqual(warned.get("shape")?.size ?? 0, 0);
  assert.strictEqual(warned.get("autoCreate")?.size ?? 0, 0);
  assert.strictEqual(warned.get("mutableResult")?.size ?? 0, 0);

  const secondWave = 300;
  for (let i = 0; i < secondWave; i += 1) {
    const name = `warn-wave-b-${i}`;
    createStore(name, makeAsyncShape());
    await fetchStore(name, Promise.resolve({ value: i }), { dedupe: false });
  }

  const peak = warned.get("noSignal")?.size ?? 0;
  assert.ok(peak <= secondWave, `expected noSignal warned set <= ${secondWave}, got ${peak}`);

  for (let i = 0; i < secondWave; i += 1) {
    deleteStore(`warn-wave-b-${i}`);
  }
  assert.strictEqual(warned.get("noSignal")?.size ?? 0, 0);
});
