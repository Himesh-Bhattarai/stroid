/**
 * @module tests/regression/computed-cycle-detection
 *
 * LAYER: Regression
 * OWNS:  Deterministic computed-cycle detection and fast-fail registration behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createStore, getStore } from "../../src/store.js";
import { createComputed } from "../../src/computed/index.js";
import { detectCycle } from "../../src/computed/computed-graph.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const now = (): number =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

test("computed registration rejects A -> B -> A cycles without hanging", { timeout: 2000 }, () => {
  resetAllStoresForTest();
  createStore("cycle-a", 1);
  createComputed("cycle-b", ["cycle-a"], (value) => value);

  const cycleTrace = detectCycle("cycle-a", ["cycle-b"]);
  assert.strictEqual(cycleTrace, "cycle-a -> cycle-b -> cycle-a");

  const start = now();
  const result = createComputed("cycle-a", ["cycle-b"], (value) => value);
  const elapsedMs = now() - start;

  assert.strictEqual(result, undefined);
  assert.strictEqual(getStore("cycle-a"), 1);
  assert.ok(elapsedMs < 250, `cycle registration should fail fast, took ${elapsedMs.toFixed(2)}ms`);
});

test("detectCycle returns null for acyclic dependency edges", () => {
  resetAllStoresForTest();
  createStore("acyclic-base", 1);
  createComputed("acyclic-mid", ["acyclic-base"], (value) => value);

  const cycleTrace = detectCycle("acyclic-top", ["acyclic-mid"]);
  assert.strictEqual(cycleTrace, null);
});
