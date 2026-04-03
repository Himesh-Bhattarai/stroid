/**
 * @module tests/integration/core/async-fetch
 *
 * LAYER: Integration
 * OWNS:  Async fetch and refetch behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore, getStore } from "../../../src/store.js";
import { fetchStore, refetchStore } from "../../../src/async.js";

test("refetchStore replays factory fetchers", async () => {
  clearAllStores();
  createStore("factoryStore", { data: null, loading: false, error: null, status: "idle" });
  let calls = 0;
  const controller = new AbortController();
  const factory = () => Promise.resolve({ ok: true, call: ++calls });
  await fetchStore("factoryStore", factory, { signal: controller.signal });
  await refetchStore("factoryStore");
  assert.ok(calls >= 2);
});

test("fetchStore reports invalid request inputs", async () => {
  clearAllStores();
  createStore("badFetch", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const result = await fetchStore("badFetch", 123 as unknown as string, { signal: controller.signal });
  assert.strictEqual(result, null);
});

test("fetchStore rejects async transform results", async () => {
  clearAllStores();
  createStore("asyncTransform", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const result = await fetchStore("asyncTransform", Promise.resolve({ ok: true }), {
    signal: controller.signal,
    transform: (async (value) => value) as unknown as (value: unknown) => unknown,
  });
  assert.strictEqual(result, null);
});

test("fetchStore aborts after transform and clone when signaled", async () => {
  clearAllStores();
  createStore("abortAfter", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const result = await fetchStore("abortAfter", Promise.resolve({ ok: true }), {
    signal: controller.signal,
    transform: (value) => {
      controller.abort();
      return value;
    },
  });
  assert.strictEqual(result, null);
});

test("refetchStore falls back to the latest cached slot when no recipe exists", async () => {
  clearAllStores();
  createStore("cachedStore", { data: null, loading: false, error: null, status: "idle" });
  await fetchStore("cachedStore", Promise.resolve({ value: 1 }), { cacheKey: "a" });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await fetchStore("cachedStore", Promise.resolve({ value: 2 }), { cacheKey: "b" });
  const result = await refetchStore("cachedStore");
  assert.ok(result);
});

test("fetchStore rate limits repeated calls", async () => {
  clearAllStores();
  createStore("rateLimitStore", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const originalNow = Date.now;
  Date.now = () => 123456;
  let result: unknown = null;
  try {
    for (let i = 0; i < 105; i++) {
      result = await fetchStore("rateLimitStore", Promise.resolve({ ok: true }), {
        signal: controller.signal,
        ttl: 0,
        dedupe: false,
      });
    }
  } finally {
    Date.now = originalNow;
  }
  assert.strictEqual(result, null);
});

test("fetchStore aborts immediately when signal is already aborted", async () => {
  clearAllStores();
  createStore("abortEarly", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  controller.abort();
  const result = await fetchStore("abortEarly", Promise.resolve({ ok: true }), { signal: controller.signal });
  assert.strictEqual(result, null);
});

test("fetchStore reports HTTP error responses", async () => {
  clearAllStores();
  createStore("httpError", { data: null, loading: false, error: null, status: "idle" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({}),
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as Response) as typeof fetch;
  try {
    const controller = new AbortController();
    const result = await fetchStore("httpError", "https://example.com", { signal: controller.signal });
    assert.strictEqual(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchStore reports auto-create failures for invalid store names", async () => {
  const controller = new AbortController();
  const result = await fetchStore("__proto__", Promise.resolve({ ok: true }), { signal: controller.signal, autoCreate: true });
  assert.strictEqual(result, null);
});

test("fetchStore aborts the internal request when the timeout fires", async () => {
  clearAllStores();
  createStore("timeoutAbort", { data: null, loading: false, error: null, status: "idle" });
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  let seenSignal: AbortSignal | undefined;

  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    seenSignal = init?.signal as AbortSignal | undefined;
    return new Promise((_, reject) => {
      seenSignal?.addEventListener("abort", () => {
        const err = new Error("aborted") as Error & { name: string };
        err.name = "AbortError";
        reject(err);
      });
    });
  }) as typeof fetch;

  globalThis.setTimeout = ((handler: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    if (ms === 60000) {
      return realSetTimeout(handler, 0, ...args) as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(handler, ms, ...args);
  }) as typeof setTimeout;

  try {
    const result = await fetchStore("timeoutAbort", "https://example.com/slow");
    assert.strictEqual(result, null);
    assert.ok(seenSignal);
    assert.strictEqual(seenSignal.aborted, true);
    const state = getStore("timeoutAbort");
    assert.strictEqual(state?.status, "error");
    assert.ok(state?.error?.includes("Timeout: async request hung for 60 seconds"));
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    clearAllStores();
  }
});
