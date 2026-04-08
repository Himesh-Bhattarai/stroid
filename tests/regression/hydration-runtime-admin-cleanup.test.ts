/**
 * @module tests/regression/hydration-runtime-admin-cleanup
 *
 * LAYER: Regression
 * OWNS:  Regression coverage for hydration cleanup symmetry and runtime-admin transaction guards.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  clearAllStores,
  createStore,
  getStore,
  hasStore,
  hydrateStores,
  setStore,
  setStoreBatch,
} from "../../src/store.js";
import { getHydrationDriftMetrics } from "../../src/runtime-tools/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("clearAllStores removes stale hydration entries and deferred writes for deleted stores", () => {
  resetAllStoresForTest();
  createStore("hydrationCleanup", { value: 1 });

  const hydration = hydrateStores(
    { hydrationCleanup: { value: 1 } },
    {},
    { allowTrusted: true },
    {
      bootWindow: { mode: "manual" },
      policyMap: { hydrationCleanup: "client_wins" },
    }
  );

  assert.ok(hydration.bootWindow?.isActive());

  setStore("hydrationCleanup", "value", 9);
  assert.deepStrictEqual(getStore("hydrationCleanup"), { value: 1 });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 1);

  clearAllStores();
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 0);

  createStore("hydrationCleanup", { value: 0 });
  setStore("hydrationCleanup", "value", 2);
  assert.deepStrictEqual(getStore("hydrationCleanup"), { value: 2 });

  hydration.bootWindow?.close();
  assert.deepStrictEqual(getStore("hydrationCleanup"), { value: 2 });
});

test("runtime-admin clearAllStores honors transaction guard inside setStoreBatch", () => {
  resetAllStoresForTest();
  createStore("runtimeAdminTxGuard", { value: 1 });

  setStoreBatch(() => {
    clearAllStores();
  });

  assert.strictEqual(hasStore("runtimeAdminTxGuard"), true);
  assert.deepStrictEqual(getStore("runtimeAdminTxGuard"), { value: 1 });

  clearAllStores();
  assert.strictEqual(hasStore("runtimeAdminTxGuard"), false);
});
