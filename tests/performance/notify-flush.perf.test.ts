/**
 * @module tests/performance/notify-flush
 *
 * LAYER: Performance
 * OWNS:  Single-store notification flush timing.
 *
 * Consumers: Test runner (performance suite).
 */
import test from "node:test";
import assert from "node:assert";
import { _subscribe, createStore, setStore } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const now = (): number =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

test("single-store notify flush stays under threshold", { timeout: 20000 }, async () => {
  resetAllStoresForTest();
  createStore("perfFlush", { value: 0 });

  const subscriberCount = 5000;
  let seen = 0;
  let resolve!: () => void;
  const done = new Promise<void>((res) => { resolve = res; });

  for (let i = 0; i < subscriberCount; i++) {
    _subscribe("perfFlush", () => {
      seen += 1;
      if (seen === subscriberCount) resolve();
    });
  }

  const start = now();
  setStore("perfFlush", "value", 1);

  await Promise.race([
    done,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("flush timeout")), 5000)),
  ]);

  const elapsed = now() - start;
  const thresholdMs = 500;
  assert.ok(
    elapsed < thresholdMs,
    `expected notify flush < ${thresholdMs}ms, got ${elapsed.toFixed(2)}ms`
  );
});
