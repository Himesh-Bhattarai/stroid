/**
 * @module tests/regression/computed-cycle
 *
 * LAYER: Regression
 * OWNS:  Cycle detection hardening for computed store registration.
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

test("computed cycle registration is rejected without hanging", { timeout: 2000 }, () => {
  resetAllStoresForTest();
  createStore("reg-cycle-a", 1);
  createComputed("reg-cycle-b", ["reg-cycle-a"], (value) => value);

  const start = now();
  const result = createComputed("reg-cycle-a", ["reg-cycle-b"], (value) => value);
  const elapsedMs = now() - start;

  assert.strictEqual(result, undefined);
  assert.strictEqual(getStore("reg-cycle-a"), 1);
  assert.ok(elapsedMs < 250, `cycle registration should fail fast, took ${elapsedMs.toFixed(2)}ms`);
});

test("detectCycle returns explicit trace for A -> B -> A", () => {
  resetAllStoresForTest();
  createStore("reg-trace-a", 1);
  createComputed("reg-trace-b", ["reg-trace-a"], (value) => value);

  const trace = detectCycle("reg-trace-a", ["reg-trace-b"]);
  assert.strictEqual(trace, "reg-trace-a -> reg-trace-b -> reg-trace-a");
});
