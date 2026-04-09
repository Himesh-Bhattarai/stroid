/**
 * @module tests/regression/nested-setStoreBatch
 *
 * LAYER: Regression
 * OWNS:  Dedicated nested setStoreBatch notification/rollback guarantees.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  getStore,
  setStore,
  setStoreBatch,
  subscribe,
} from "../../src/store.js";
import { getRegistry } from "../../src/core/store-lifecycle.js";
import { waitForNotificationIdle } from "../../src/notification/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const readValue = (snapshot: unknown): number | null => {
  if (!snapshot || typeof snapshot !== "object") return null;
  const candidate = (snapshot as { value?: unknown }).value;
  return typeof candidate === "number" ? candidate : null;
};

test("nested setStoreBatch emits one final notification with the committed state", async () => {
  resetAllStoresForTest();
  createStore("nestedBatchStandalone", { value: 0 });

  const seen: number[] = [];
  subscribe("nestedBatchStandalone", (snapshot) => {
    const value = readValue(snapshot);
    if (value !== null) seen.push(value);
  });

  setStoreBatch(() => {
    setStore("nestedBatchStandalone", "value", 1);
    setStoreBatch(() => {
      setStore("nestedBatchStandalone", "value", 2);
      setStore("nestedBatchStandalone", "value", 3);
    });
    setStore("nestedBatchStandalone", "value", 4);
  });

  await waitForNotificationIdle(getRegistry());

  assert.deepStrictEqual(getStore("nestedBatchStandalone"), { value: 4 });
  assert.deepStrictEqual(seen, [4]);
});

test("nested setStoreBatch rolls back all staged writes when an inner batch fails", async () => {
  resetAllStoresForTest();
  createStore("nestedBatchRollback", { value: 0 });

  let calls = 0;
  subscribe("nestedBatchRollback", () => {
    calls += 1;
  });

  setStoreBatch(() => {
    setStore("nestedBatchRollback", "value", 1);
    setStoreBatch(() => {
      setStore("nestedBatchRollback", "value", 2);
      throw new Error("boom");
    });
  });

  await waitForNotificationIdle(getRegistry());

  assert.deepStrictEqual(getStore("nestedBatchRollback"), { value: 0 });
  assert.strictEqual(calls, 0);
});
