/**
 * @module tests/performance/subscriber-concurrent
 *
 * LAYER: Performance
 * OWNS:  Concurrent multi-store subscriber fanout timing.
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

const createUniqueNoop = (seed: number) => (state: any) => {
  void seed;
  void state;
};

test("concurrent multi-store subscriber fanout stays under threshold", { timeout: 30000 }, async () => {
  resetAllStoresForTest();

  const storeNames = ["perfShardA", "perfShardB", "perfShardC", "perfShardD", "perfShardE"] as const;
  const subscribersPerStore = 10_000;

  storeNames.forEach((name) => {
    createStore(name, { value: 0 });
  });

  let seed = 0;
  storeNames.forEach((name) => {
    for (let index = 0; index < subscribersPerStore; index += 1) {
      _subscribe(name, createUniqueNoop(seed));
      seed += 1;
    }
  });

  const expectedValueByStore = new Map(storeNames.map((name, index) => [name, index + 1] as const));
  const pending = new Set<string>(storeNames);

  let resolve!: () => void;
  const done = new Promise<void>((res) => {
    resolve = res;
  });

  const offs = storeNames.map((name) =>
    _subscribe(name, (snapshot: any) => {
      if (!pending.has(name)) return;
      if (snapshot?.value !== expectedValueByStore.get(name)) return;
      pending.delete(name);
      if (pending.size === 0) resolve();
    })
  );

  try {
    const start = now();

    storeNames.forEach((name) => {
      queueMicrotask(() => {
        setStore(name, { value: expectedValueByStore.get(name)! });
      });
    });

    await Promise.race([
      done,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("concurrent fanout timeout")), 10000)),
    ]);

    const elapsed = now() - start;
    const thresholdMs = 5000;

    assert.strictEqual(pending.size, 0, `expected all stores to flush, pending: ${Array.from(pending).join(", ")}`);
    assert.ok(
      elapsed < thresholdMs,
      `expected concurrent fanout < ${thresholdMs}ms, got ${elapsed.toFixed(2)}ms`,
    );
  } finally {
    offs.forEach((off) => off());
  }
});
