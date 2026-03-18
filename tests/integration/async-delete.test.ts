/**
 * @module tests/integration/async-delete
 *
 * LAYER: Integration
 * OWNS:  Async fetch lifecycle when stores are deleted mid-flight.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, deleteStore, getStore, hasStore } from "../../src/store.js";
import { fetchStore } from "../../src/async.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("fetchStore resolves after deleteStore without recreating the store", async () => {
  resetAllStoresForTest();
  createStore("lateFetch", {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });

  let resolve!: (value: { value: number }) => void;
  const pending = new Promise<{ value: number }>((res) => { resolve = res; });

  const request = fetchStore("lateFetch", pending, { dedupe: false });
  deleteStore("lateFetch");
  assert.strictEqual(hasStore("lateFetch"), false);

  resolve({ value: 123 });
  await request;

  assert.strictEqual(hasStore("lateFetch"), false);
  assert.strictEqual(getStore("lateFetch"), null);
});
