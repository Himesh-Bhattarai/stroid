/**
 * @fileoverview tests\testing.test.ts
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, getStore, hasStore, store } from "../src/store.js";
import { fetchStore, getAsyncMetrics, refetchStore } from "../src/async.js";
import { collectLegacyOptionDeprecationWarnings } from "../src/adapters/options.js";
import { benchmarkStoreSet, createMockStore, resetAllStoresForTest, withMockedTime } from "../src/testing.js";
import { registerTestResetHook } from "../src/internals/test-reset.js";

test("resetAllStoresForTest clears registries without firing delete hooks", () => {
  let deletes = 0;

  createStore("testReset", { value: 1 }, {
    onDelete: () => {
      deletes += 1;
    },
  });

  resetAllStoresForTest();

  assert.strictEqual(hasStore("testReset"), false);
  assert.strictEqual(deletes, 0);
});

test("createMockStore proxies set, reset, and use helpers", () => {
  resetAllStoresForTest();
  const mock = createMockStore("mockUser", { value: 1, nested: { color: "blue" } });

  assert.strictEqual(mock.use().name, "mockUser");
  assert.deepStrictEqual(getStore("mockUser"), { value: 1, nested: { color: "blue" } });

  mock.set({ value: 2 });
  assert.deepStrictEqual(getStore("mockUser"), { value: 2, nested: { color: "blue" } });

  mock.set((draft: any) => {
    draft.nested.color = "green";
  });
  assert.deepStrictEqual(getStore("mockUser"), { value: 2, nested: { color: "green" } });

  mock.reset();
  assert.deepStrictEqual(getStore("mockUser"), { value: 1, nested: { color: "blue" } });
});

test("withMockedTime restores Date.now even when the callback throws", () => {
  const realNow = Date.now;

  assert.throws(() => {
    withMockedTime(12345, () => {
      assert.strictEqual(Date.now(), 12345);
      throw new Error("boom");
    });
  }, /boom/);

  assert.strictEqual(Date.now, realNow);
});

test("benchmarkStoreSet returns stable structure and respects iteration count", () => {
  resetAllStoresForTest();
  createStore("benchStore", { value: 0 });

  const result = benchmarkStoreSet(store("benchStore"), 5, (i) => ({ value: i }));

  assert.strictEqual(result.iterations, 5);
  assert.ok(Number.isFinite(result.totalMs));
  assert.ok(Number.isFinite(result.avgMs));
  assert.ok(result.totalMs >= 0);
  assert.ok(result.avgMs >= 0);
  assert.deepStrictEqual(getStore("benchStore"), { value: 4 });
});

test("resetAllStoresForTest resets async registries and metrics", async () => {
  resetAllStoresForTest();

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => ({ value: 1 }),
    text: async () => JSON.stringify({ value: 1 }),
  })) as typeof fetch;

  try {
    createStore("resetAsyncStore", {
      data: null,
      loading: false,
      error: null,
      status: "idle",
    });
    await fetchStore("resetAsyncStore", "https://api.example.com/reset");
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.ok(getAsyncMetrics().requests > 0);

  resetAllStoresForTest();

  assert.deepStrictEqual(getAsyncMetrics(), {
    cacheHits: 0,
    cacheMisses: 0,
    dedupes: 0,
    requests: 0,
    failures: 0,
    avgMs: 0,
    lastMs: 0,
  });
  assert.strictEqual(await refetchStore("resetAsyncStore"), undefined);
});

test("resetAllStoresForTest resets legacy option deprecation warnings", () => {
  resetAllStoresForTest();

  const first = collectLegacyOptionDeprecationWarnings({
    historyLimit: 5,
    middleware: [],
  });

  assert.deepStrictEqual(first, [
    'createStore option "historyLimit" is deprecated. Use "devtools.historyLimit" instead.',
    'createStore option "middleware" is deprecated. Use "lifecycle.middleware" instead.',
  ]);

  assert.deepStrictEqual(
    collectLegacyOptionDeprecationWarnings({
      historyLimit: 5,
      middleware: [],
    }),
    []
  );

  resetAllStoresForTest();

  assert.deepStrictEqual(
    collectLegacyOptionDeprecationWarnings({
      historyLimit: 5,
      middleware: [],
    }),
    [
      'createStore option "historyLimit" is deprecated. Use "devtools.historyLimit" instead.',
      'createStore option "middleware" is deprecated. Use "lifecycle.middleware" instead.',
    ]
  );
});

test("resetAllStoresForTest runs registered reset hooks", () => {
  let calls = 0;
  registerTestResetHook("tests.reset-hook", () => {
    calls += 1;
  }, 5000);

  const before = calls;
  resetAllStoresForTest();
  assert.ok(calls > before);
});

