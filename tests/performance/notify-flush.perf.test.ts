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

const measureFlushMs = async (storeName: string, subscriberCount: number): Promise<number> => {
  createStore(storeName, { value: 0 });
  let seen = 0;
  let resolve!: () => void;
  const done = new Promise<void>((res) => { resolve = res; });

  for (let i = 0; i < subscriberCount; i += 1) {
    _subscribe(storeName, () => {
      seen += 1;
      if (seen === subscriberCount) resolve();
    });
  }

  const start = now();
  setStore(storeName, "value", 1);
  await Promise.race([
    done,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("flush timeout")), 5000)),
  ]);
  return now() - start;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

test("single-store notify flush stays under hardened threshold (warmup + median)", { timeout: 30000 }, async () => {
  resetAllStoresForTest();
  const subscriberCount = 5000;

  // JIT warmup run (excluded from thresholds).
  await measureFlushMs("perfFlush-warmup", subscriberCount);
  resetAllStoresForTest();

  const runs: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    runs.push(await measureFlushMs(`perfFlush-${i}`, subscriberCount));
    resetAllStoresForTest();
  }

  const elapsed = median(runs);
  const thresholdMs = 150;
  assert.ok(
    elapsed < thresholdMs,
    `expected median notify flush < ${thresholdMs}ms, got ${elapsed.toFixed(2)}ms (runs=${runs.map((v) => v.toFixed(2)).join(",")})`
  );

  const perSubscriberMs = elapsed / subscriberCount;
  assert.ok(
    perSubscriberMs < 0.03,
    `expected median per-subscriber notify cost < 0.03ms, got ${perSubscriberMs.toFixed(5)}ms`
  );
});
