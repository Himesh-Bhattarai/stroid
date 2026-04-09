/**
 * @module tests/regression/selector-cache-growth
 *
 * LAYER: Regression
 * OWNS:  Deterministic computed-order cache growth checks.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../src/store.js";
import { createComputed, deleteComputed } from "../../src/computed/index.js";
import {
  _getComputedOrderCacheStatsForTests,
  getTopoOrderedComputeds,
} from "../../src/computed/computed-graph.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("computed order cache entry count stays bounded across computed create/delete churn", () => {
  resetAllStoresForTest();
  createStore("selector-cache-base", { value: 0 });

  const baseline = _getComputedOrderCacheStatsForTests();
  const iterations = 250;

  for (let i = 0; i < iterations; i += 1) {
    const name = `selector-cache-ephemeral-${i}`;
    createComputed(name, ["selector-cache-base"], (state) => {
      const typed = state as { value: number } | null;
      return (typed?.value ?? 0) + i;
    });
    getTopoOrderedComputeds(["selector-cache-base"]);
    deleteComputed(name);
    getTopoOrderedComputeds(["selector-cache-base"]);
  }

  const after = _getComputedOrderCacheStatsForTests();
  const computeDelta = after.computeCount - baseline.computeCount;

  assert.ok(
    after.entryCount <= baseline.entryCount + 2,
    `expected cache keys to stay bounded, entryCount delta=${after.entryCount - baseline.entryCount}`
  );
  assert.ok(
    computeDelta <= (iterations * 2) + 20,
    `expected near-linear recompute cost, compute delta=${computeDelta}`
  );
});

test("computed order cache reuses one result for repeated identical source queries", () => {
  resetAllStoresForTest();
  createStore("selector-cache-stable", { value: 0 });
  createComputed("selector-cache-level1", ["selector-cache-stable"], (state) => state);
  createComputed("selector-cache-level2", ["selector-cache-level1"], (state) => state);

  const before = _getComputedOrderCacheStatsForTests();
  const loops = 1500;
  for (let i = 0; i < loops; i += 1) {
    getTopoOrderedComputeds(["selector-cache-stable"]);
  }
  const after = _getComputedOrderCacheStatsForTests();

  assert.strictEqual(
    after.computeCount - before.computeCount,
    1,
    "expected one topo computation for repeated identical graph/source queries"
  );
  assert.ok(after.entryCount >= 1, "expected a cached topo entry to exist");
});
