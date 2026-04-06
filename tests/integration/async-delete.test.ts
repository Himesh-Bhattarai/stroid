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
import { fetchStore, refetchStore } from "../../src/async.js";
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

test("deleteStore aborts in-flight fetches even when caller provides AbortSignal", async () => {
  resetAllStoresForTest();
  createStore("deleteWithSignal", {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });

  const realFetch = globalThis.fetch;
  let sawAbort = false;
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const activeSignal = init?.signal;
      if (!activeSignal) return;
      const onAbort = () => {
        sawAbort = true;
        const abortErr = new Error("aborted");
        (abortErr as Error & { name: string }).name = "AbortError";
        reject(abortErr);
      };
      if (activeSignal.aborted) {
        onAbort();
        return;
      }
      activeSignal.addEventListener("abort", onAbort, { once: true });
    })) as typeof fetch;

  const externalController = new AbortController();
  const timeoutToken = Symbol("timeout");

  try {
    const request = fetchStore("deleteWithSignal", "https://example.test/hang", {
      signal: externalController.signal,
      dedupe: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    deleteStore("deleteWithSignal");

    const settled = await Promise.race([
      request,
      new Promise<typeof timeoutToken>((resolve) => {
        setTimeout(() => resolve(timeoutToken), 250);
      }),
    ]);

    assert.notStrictEqual(settled, timeoutToken);
    assert.strictEqual(settled, null);
    assert.strictEqual(sawAbort, true);
    assert.strictEqual(externalController.signal.aborted, false);
    assert.strictEqual(hasStore("deleteWithSignal"), false);
    assert.strictEqual(await refetchStore("deleteWithSignal"), undefined);
  } finally {
    externalController.abort();
    globalThis.fetch = realFetch;
  }
});
