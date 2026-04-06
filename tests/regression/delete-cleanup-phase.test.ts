/**
 * @module tests/regression/delete-cleanup-phase
 *
 * LAYER: Regression
 * OWNS:  Delete lifecycle cleanup ordering and async metadata teardown guarantees.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHook } from "../../src/core/lifecycle-hooks.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { fetchStore, refetchStore } from "../../src/async.js";
import { createStore, deleteStore, hasStore } from "../../src/store.js";

test("deleteStore runs storeDeleteCleanup before afterStoreDelete and clears async metadata immediately", async () => {
  resetAllStoresForTest();
  createStore("cleanupPhaseStore", {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });

  const order: string[] = [];
  const offCleanup = registerHook("storeDeleteCleanup", (name) => {
    if (name === "cleanupPhaseStore") order.push("cleanup");
  });
  const offAfter = registerHook("afterStoreDelete", (name) => {
    if (name === "cleanupPhaseStore") order.push("after");
  });

  try {
    await fetchStore("cleanupPhaseStore", Promise.resolve({ value: 1 }), { cacheKey: "phase" });
    const beforeDelete = await refetchStore("cleanupPhaseStore");
    assert.deepStrictEqual(beforeDelete, { value: 1 });

    deleteStore("cleanupPhaseStore");

    assert.deepStrictEqual(order, ["cleanup", "after"]);
    assert.strictEqual(hasStore("cleanupPhaseStore"), false);
    const afterDelete = await refetchStore("cleanupPhaseStore");
    assert.strictEqual(afterDelete, undefined);
  } finally {
    offCleanup();
    offAfter();
  }
});

