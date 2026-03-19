/**
 * @module tests/performance/stress-memory
 *
 * LAYER: Performance
 * OWNS:  Test coverage for tests/performance/stress-memory.
 *
 * Consumers: Test runner.
 */
import assert from "node:assert";
import test from "node:test";
import { fetchStore, refetchStore } from "../../src/async.js";
import { clearAllStores } from "../../src/runtime-admin/index.js";
import { _subscribe, createStore, deleteStore, getStore, hasStore, setStore } from "../../src/store.js";
import { getMetrics, listStores } from "../../src/runtime-tools/index.js";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("heavy fanout updates deliver all notifications under subscriber load", async () => {
  clearAllStores();
  createStore("heavyFanout", { value: 0 });

  const subscriberCount = 250;
  const updateCount = 20;
  const seen = new Array<number>(subscriberCount).fill(0);

  for (let i = 0; i < subscriberCount; i++) {
    _subscribe("heavyFanout", (value) => {
      if (!value) return;
      seen[i] += 1;
      assert.strictEqual((value as { value: number }).value >= 1, true);
    });
  }

  for (let i = 1; i <= updateCount; i++) {
    setStore("heavyFanout", { value: i });
    await wait();
  }

  assert.ok(seen.every((count) => count === updateCount));
  assert.deepStrictEqual(getStore("heavyFanout"), { value: updateCount });
  assert.strictEqual(getMetrics("heavyFanout")?.notifyCount, updateCount);
});

test("heavy repeated async fetch delete cycles clear per-store async state", async () => {
  clearAllStores();
  const realFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ call: calls }),
      text: async () => JSON.stringify({ call: calls }),
    } as any;
  }) as typeof fetch;

  try {
    for (let i = 0; i < 40; i++) {
      createStore("heavyAsync", {
        data: null,
        loading: false,
        error: null,
        status: "idle",
      });
      const result = await fetchStore("heavyAsync", "https://api.example.com/heavy", {
        dedupe: false,
        cacheKey: `slot-${i}`,
      });
      assert.deepStrictEqual(result, { call: i + 1 });
      deleteStore("heavyAsync");
      assert.strictEqual(hasStore("heavyAsync"), false);
      assert.strictEqual(await refetchStore("heavyAsync"), undefined);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("heavy repeated create delete cycles leave no residual stores", () => {
  clearAllStores();

  for (let i = 0; i < 200; i++) {
    createStore(`ephemeral-${i}`, { value: i });
    assert.strictEqual(hasStore(`ephemeral-${i}`), true);
    deleteStore(`ephemeral-${i}`);
    assert.strictEqual(hasStore(`ephemeral-${i}`), false);
  }

  assert.deepStrictEqual(listStores(), []);
});


