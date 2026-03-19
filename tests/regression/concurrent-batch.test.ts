/**
 * @module tests/regression/concurrent-batch
 *
 * LAYER: Regression
 * OWNS:  Concurrent setStoreBatch calls in the same event loop.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, getStore, setStore, setStoreBatch, subscribe } from "../../src/store.js";
import { getStoreMeta } from "../../src/runtime-tools/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("concurrent setStoreBatch calls commit independently", async () => {
  resetAllStoresForTest();
  createStore("batchStore", { value: 0 });

  const seen: number[] = [];
  const unsub = subscribe("batchStore", (snap) => {
    if (snap && typeof (snap as any).value === "number") {
      seen.push((snap as any).value);
    }
  });

  await Promise.all([
    Promise.resolve().then(() => {
      setStoreBatch(() => {
        setStore("batchStore", "value", 1);
      });
    }),
    Promise.resolve().then(() => {
      setStoreBatch(() => {
        setStore("batchStore", "value", 2);
      });
    }),
  ]);

  await Promise.resolve();
  unsub();

  const meta = getStoreMeta("batchStore");
  assert.ok((meta?.updateCount ?? 0) >= 2);
  assert.deepStrictEqual(getStore("batchStore"), { value: 2 });
});
