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
