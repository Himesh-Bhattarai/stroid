/**
 * @module tests/integration/core/async-runtime
 *
 * LAYER: Integration
 * OWNS:  Async cache, retry, revalidate, and rate behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore } from "../../../src/store.js";
import { fetchStore, enableRevalidateOnFocus } from "../../../src/async.js";
import { shouldUseCache, pruneAsyncCache, getCacheMeta, getRequestVersionRegistry, getFetchRegistry } from "../../../src/async/cache.js";
import { createAsyncRegistry, resetAsyncRegistry } from "../../../src/async/registry.js";
import { delay, normalizeRetryOptions } from "../../../src/async/retry.js";
import { reactQueryKey, createReactQueryFetcher, createSwrFetcher } from "../../../src/integrations/query.js";
import { cloneAsyncResult } from "../../../src/async/clone.js";
import { registerRateHit, pruneRateCounters, RATE_WINDOW_MS } from "../../../src/async/rate.js";
import { tryDedupeRequest, setInflightEntry, clearInflightEntry } from "../../../src/async/inflight.js";
import { throwAsyncUsageError } from "../../../src/async/errors.js";

test("async cache expiry and prune paths clear expired entries", () => {
  const cacheMeta = getCacheMeta();
  const now = Date.now();
  cacheMeta["expires"] = { timestamp: now - 1000, expiresAt: now - 1, data: "x" };
  assert.strictEqual(shouldUseCache("expires", 1000), false);
  assert.ok(!("expires" in cacheMeta));

  cacheMeta["persist"] = { timestamp: now, expiresAt: now + 1000, data: "y" };
  cacheMeta["persist:old"] = { timestamp: now - 5000, expiresAt: now - 1, data: "z" };
  const requestVersion = getRequestVersionRegistry();
  requestVersion["persist:old"] = 1;
  pruneAsyncCache("persist");
  assert.ok(!("persist:old" in cacheMeta));
});

test("resetAsyncRegistry cleans handlers and timers", () => {
  const registry = createAsyncRegistry();
  let calls = 0;
  registry.revalidateHandlers["one"] = () => { calls += 1; };
  registry.storeCleanups["one"] = {
    store: new Set([() => { calls += 1; }]),
    revalidate: new Set([() => { calls += 1; }]),
  };
  registry.ratePruneTimer = setTimeout(() => {}, 1000);
  resetAsyncRegistry(registry);
  assert.ok(calls >= 2);
  assert.strictEqual(registry.ratePruneTimer, null);
});

test("delay resolves on abort and retry normalization clamps non-finite values", async () => {
  const controller = new AbortController();
  controller.abort();
  await delay(5, controller.signal);

  const controller2 = new AbortController();
  const pending = delay(50, controller2.signal);
  controller2.abort();
  await pending;

  const normalized = normalizeRetryOptions("retry", Number.POSITIVE_INFINITY, Number.NaN, Number.NaN);
  assert.ok(Number.isFinite(normalized.retryDelay));
  assert.ok(Number.isFinite(normalized.retryBackoff));
});

test("integration query helpers build keys and fetchers", async () => {
  clearAllStores();
  createStore("queryStore", { data: null, loading: false, error: null, status: "idle" });
  assert.deepStrictEqual(reactQueryKey("queryStore"), ["stroid", "queryStore"]);
  assert.deepStrictEqual(reactQueryKey({ name: "queryStore" }, "k"), ["stroid", "queryStore", "k"]);

  const fetcher = createReactQueryFetcher("queryStore", Promise.resolve({ ok: true }));
  await fetcher();
  const fetcherObj = createReactQueryFetcher({ name: "queryStore" }, Promise.resolve({ ok: true }));
  await fetcherObj();

  const swrFetcher = createSwrFetcher({ name: "queryStore" }, Promise.resolve({ ok: true }));
  await swrFetcher();
  const swrFetcherString = createSwrFetcher("queryStore", Promise.resolve({ ok: true }));
  await swrFetcherString();
});

test("enableRevalidateOnFocus handles debounce and staggered batches", async () => {
  clearAllStores();
  createStore("focusA", { data: null, loading: false, error: null, status: "idle" });
  createStore("focusB", { data: null, loading: false, error: null, status: "idle" });

  const controller = new AbortController();
  await fetchStore("focusA", Promise.resolve({ ok: true }), { signal: controller.signal });
  await fetchStore("focusB", Promise.resolve({ ok: true }), { signal: controller.signal });

  const cleanup = enableRevalidateOnFocus("*", { debounceMs: 5, maxConcurrent: 1, staggerMs: 5 });
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  cleanup();

  const immediateCleanup = enableRevalidateOnFocus("focusA", { debounceMs: 0, staggerMs: 0 });
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  immediateCleanup();
});

test("enableRevalidateOnFocus honors priority ordering and empty registries", async () => {
  clearAllStores();
  createStore("prioA", { data: null, loading: false, error: null, status: "idle" });
  createStore("prioB", { data: null, loading: false, error: null, status: "idle" });
  createStore("prioC", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const factory = () => Promise.resolve({ ok: true });
  await fetchStore("prioA", factory, { signal: controller.signal });
  await fetchStore("prioB", factory, { signal: controller.signal });
  await fetchStore("prioC", factory, { signal: controller.signal });

  const cleanupBatch = enableRevalidateOnFocus("*", { debounceMs: 0, maxConcurrent: 1, staggerMs: 2 });
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  cleanupBatch();

  const cleanupPriority = enableRevalidateOnFocus("prioB", { debounceMs: 0, priority: "high" });
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 1));
  cleanupPriority();

  const fetchRegistry = getFetchRegistry();
  Object.keys(fetchRegistry).forEach((key) => delete fetchRegistry[key]);
  const cleanupEmpty = enableRevalidateOnFocus("*", { debounceMs: 0 });
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 1));
  cleanupEmpty();
});

test("cloneAsyncResult supports shallow and deep modes", () => {
  const value = { nested: { value: 1 } };
  const shallow = cloneAsyncResult(value, "shallow") as { nested: { value: number } };
  assert.notStrictEqual(shallow, value);
  assert.strictEqual(shallow.nested, value.nested);

  const deep = cloneAsyncResult(value, "deep") as { nested: { value: number } };
  assert.notStrictEqual(deep, value);
  assert.notStrictEqual(deep.nested, value.nested);
});

test("registerRateHit returns true after exceeding the rate window", () => {
  const slot = "rateHit";
  const now = Date.now();
  let tripped = false;
  for (let i = 0; i < 200; i++) {
    if (registerRateHit(slot, now)) {
      tripped = true;
      break;
    }
  }
  assert.strictEqual(tripped, true);
});

test("pruneRateCounters evicts expired rate entries", () => {
  const now = Date.now();
  registerRateHit("pruneSlot", now - RATE_WINDOW_MS - 10);
  pruneRateCounters(now);
  const after = registerRateHit("pruneSlot", now);
  assert.strictEqual(after, false);
});

test("tryDedupeRequest returns inflight promise or transforms raw data", async () => {
  const cacheSlot = "dedupe-path";
  const rawPayload = { value: 3 };
  const inflightPromise = Promise.resolve("done");
  setInflightEntry(cacheSlot, { promise: inflightPromise, raw: Promise.resolve(rawPayload) });
  try {
    const same = tryDedupeRequest("dedupe", cacheSlot, undefined);
    assert.strictEqual(same, inflightPromise);
    const transformed = await tryDedupeRequest("dedupe", cacheSlot, (raw: any) => raw.value + 1);
    assert.strictEqual(transformed, 4);
  } finally {
    clearInflightEntry(cacheSlot);
  }
});

test("throwAsyncUsageError uses critical path when dev is disabled", () => {
  const originalDev = (globalThis as any).__STROID_DEV__;
  (globalThis as any).__STROID_DEV__ = false;
  try {
    assert.throws(() => {
      throwAsyncUsageError("usageError", "usage boom");
    }, /usage boom/);
  } finally {
    (globalThis as any).__STROID_DEV__ = originalDev;
  }
});
