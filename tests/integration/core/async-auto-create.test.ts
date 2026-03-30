/**
 * @module tests/integration/core/async-auto-create
 *
 * LAYER: Integration
 * OWNS:  Regression coverage for async autoCreate disabled behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { configureStroid, resetConfig } from "../../../src/config.js";
import { fetchStore } from "../../../src/async.js";
import { clearAllStores, createStore, getStore, hasStore } from "../../../src/store.js";

const missingStoreMessage = (name: string): string =>
  `fetchStore("${name}") requires an existing backing store when autoCreate is disabled.\n` +
  `Call createStore("${name}", ...) first or enable autoCreate.`;

const makeJsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { get: () => "application/json" },
  json: async () => payload,
  text: async () => JSON.stringify(payload),
}) as any;

test("fetchStore with autoCreate disabled requires an existing backing store", async () => {
  clearAllStores();
  configureStroid({ asyncAutoCreate: false });

  const storeName = "mem";
  const errors: string[] = [];
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return makeJsonResponse({ value: "unexpected" });
  }) as typeof fetch;

  try {
    const result = await fetchStore(storeName, "https://api.example.com/mem", {
      onError: (message) => {
        errors.push(message);
      },
    });

    assert.strictEqual(result, null);
    assert.strictEqual(fetchCalls, 0);
    assert.strictEqual(hasStore(storeName), false);
    assert.strictEqual(getStore(storeName), null);
    assert.deepStrictEqual(errors, [missingStoreMessage(storeName)]);
  } finally {
    globalThis.fetch = realFetch;
    resetConfig();
    clearAllStores();
  }
});

test("fetchStore with autoCreate disabled stays side-effect free under 3 concurrent callers", async () => {
  clearAllStores();
  configureStroid({ asyncAutoCreate: false });

  const storeName = "mem";
  const errors: string[] = [];
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return makeJsonResponse({ value: "unexpected" });
  }) as typeof fetch;

  try {
    const p1 = fetchStore(storeName, "https://api.example.com/a", {
      onError: (message) => {
        errors.push(message);
      },
    });
    await Promise.resolve();
    const p2 = fetchStore(storeName, "https://api.example.com/b", {
      onError: (message) => {
        errors.push(message);
      },
    });
    await Promise.resolve();
    const p3 = fetchStore(storeName, "https://api.example.com/c", {
      onError: (message) => {
        errors.push(message);
      },
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assert.strictEqual(r1, null);
    assert.strictEqual(r2, null);
    assert.strictEqual(r3, null);
    assert.strictEqual(fetchCalls, 0);
    assert.strictEqual(hasStore(storeName), false);
    assert.strictEqual(getStore(storeName), null);
    assert.deepStrictEqual(errors, [
      missingStoreMessage(storeName),
      missingStoreMessage(storeName),
      missingStoreMessage(storeName),
    ]);
  } finally {
    globalThis.fetch = realFetch;
    resetConfig();
    clearAllStores();
  }
});

test("fetchStore with autoCreate disabled succeeds once a backing store exists", async () => {
  clearAllStores();
  configureStroid({ asyncAutoCreate: false });

  const storeName = "mem";
  const controller = new AbortController();
  const errors: string[] = [];
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return makeJsonResponse({ value: 42 });
  }) as typeof fetch;

  try {
    createStore(storeName, {
      data: null,
      loading: false,
      error: null,
      status: "idle",
    });

    const result = await fetchStore(storeName, "https://api.example.com/mem", {
      signal: controller.signal,
      onError: (message) => {
        errors.push(message);
      },
    });

    assert.deepStrictEqual(result, { value: 42 });
    assert.strictEqual(fetchCalls, 1);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(hasStore(storeName), true);
    assert.deepStrictEqual(getStore(storeName), {
      data: { value: 42 },
      loading: false,
      error: null,
      status: "success",
      cached: false,
      revalidating: false,
    });
  } finally {
    globalThis.fetch = realFetch;
    resetConfig();
    clearAllStores();
  }
});
