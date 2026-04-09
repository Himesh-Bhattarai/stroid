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
import {
  clearAsyncMeta,
  countInflightSlots,
  getAsyncCachePruneCounters,
  getAsyncMetricsByStore,
  getCacheMeta,
  getFetchRegistry,
  getRateCountRegistry,
  getRateWindowStartRegistry,
  getRequestSequenceRegistry,
  getRequestVersionRegistry,
  pruneAsyncCache,
  shouldUseCache,
  trackAsyncSlot,
} from "../../../src/async/cache.js";
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

test("clearAsyncMeta removes tracked async bookkeeping in one pass", () => {
  const cacheMeta = getCacheMeta();
  const requestVersion = getRequestVersionRegistry();
  const requestSequence = getRequestSequenceRegistry();
  const rateWindowStart = getRateWindowStartRegistry();
  const rateCount = getRateCountRegistry();
  const fetchRegistry = getFetchRegistry();
  const slot = "clearMetaStore:slot-a";

  trackAsyncSlot("clearMetaStore", slot);
  cacheMeta[slot] = { timestamp: Date.now(), expiresAt: Date.now() + 5000, data: { ok: true } };
  requestVersion[slot] = 1;
  requestSequence[slot] = 1;
  rateWindowStart[slot] = Date.now();
  rateCount[slot] = 1;
  fetchRegistry.clearMetaStore = {
    kind: "url",
    url: "https://api.example.com/clear",
    options: {},
  };
  getAsyncMetricsByStore().set("clearMetaStore", {
    cacheHits: 1,
    cacheMisses: 2,
    dedupes: 0,
    requests: 3,
    failures: 0,
    avgMs: 10,
    lastMs: 5,
  });
  getAsyncCachePruneCounters().set("clearMetaStore", 9);

  clearAsyncMeta("clearMetaStore");

  assert.ok(!Object.prototype.hasOwnProperty.call(cacheMeta, slot));
  assert.ok(!Object.prototype.hasOwnProperty.call(requestVersion, slot));
  assert.ok(!Object.prototype.hasOwnProperty.call(requestSequence, slot));
  assert.ok(!Object.prototype.hasOwnProperty.call(rateWindowStart, slot));
  assert.ok(!Object.prototype.hasOwnProperty.call(rateCount, slot));
  assert.ok(!Object.prototype.hasOwnProperty.call(fetchRegistry, "clearMetaStore"));
  assert.strictEqual(getAsyncMetricsByStore().has("clearMetaStore"), false);
  assert.strictEqual(getAsyncCachePruneCounters().has("clearMetaStore"), false);
});

test("clearAsyncMeta does not delete async slots owned by a namespaced child store", () => {
  const cacheMeta = getCacheMeta();
  const requestVersion = getRequestVersionRegistry();
  const requestSequence = getRequestSequenceRegistry();
  const rateWindowStart = getRateWindowStartRegistry();
  const rateCount = getRateCountRegistry();
  const slot = "ns::child:slot-a";
  const now = Date.now();

  trackAsyncSlot("ns::child", slot);
  cacheMeta[slot] = { timestamp: now, expiresAt: now + 5000, data: { ok: true } };
  requestVersion[slot] = 1;
  requestSequence[slot] = 1;
  rateWindowStart[slot] = now;
  rateCount[slot] = 1;

  clearAsyncMeta("ns");

  assert.ok(Object.prototype.hasOwnProperty.call(cacheMeta, slot));
  assert.ok(Object.prototype.hasOwnProperty.call(requestVersion, slot));
  assert.ok(Object.prototype.hasOwnProperty.call(requestSequence, slot));
  assert.ok(Object.prototype.hasOwnProperty.call(rateWindowStart, slot));
  assert.ok(Object.prototype.hasOwnProperty.call(rateCount, slot));

  clearAsyncMeta("ns::child");
});

test("countInflightSlots does not attribute a namespaced child slot to its parent store", () => {
  const slot = "ns::child:slot-inflight";
  const never = new Promise(() => {});

  setInflightEntry(slot, {
    promise: never,
    raw: never,
  }, "ns::child");

  try {
    assert.strictEqual(countInflightSlots("ns"), 0);
    assert.strictEqual(countInflightSlots("ns::child"), 1);
  } finally {
    clearInflightEntry(slot);
  }
});

test("resetAsyncRegistry cleans handlers and timers", () => {
  const registry = createAsyncRegistry();
  let calls = 0;
  registry.revalidateHandlers["one"] = () => { calls += 1; };
  registry.storeCleanups.set("one", {
    store: new Set([() => { calls += 1; }]),
    revalidate: new Set([() => { calls += 1; }]),
  });
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

test("enableRevalidateOnFocus cleanup cancels queued staggered refetch timers", async () => {
  clearAllStores();
  createStore("focusCancelA", { data: null, loading: false, error: null, status: "idle" });
  createStore("focusCancelB", { data: null, loading: false, error: null, status: "idle" });
  const calls: string[] = [];
  const makeFactory = (name: string) => () => {
    calls.push(name);
    return Promise.resolve({ ok: true });
  };

  await fetchStore("focusCancelA", makeFactory("focusCancelA"));
  await fetchStore("focusCancelB", makeFactory("focusCancelB"));
  calls.length = 0;

  const cleanup = enableRevalidateOnFocus("*", { debounceMs: 0, maxConcurrent: 1, staggerMs: 10 });
  window.dispatchEvent(new Event("focus"));
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepStrictEqual(calls, []);
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

test("tryDedupeRequest returns the inflight promise when the request contract matches", () => {
  const cacheSlot = "dedupe-path";
  const rawPayload = { value: 3 };
  const inflightPromise = Promise.resolve(rawPayload);
  setInflightEntry(cacheSlot, {
    promise: inflightPromise,
    raw: Promise.resolve(rawPayload),
    cloneResult: "none",
    contract: {
      requestKind: "url",
      url: "https://api.example.com/value",
      method: "GET",
      responseType: "auto",
    },
  });
  try {
    const same = tryDedupeRequest("dedupe", cacheSlot, {
      contract: {
        requestKind: "url",
        url: "https://api.example.com/value",
        method: "GET",
        responseType: "auto",
      },
      cloneResult: "none",
    });
    assert.strictEqual(same, inflightPromise);
  } finally {
    clearInflightEntry(cacheSlot);
  }
});

test("tryDedupeRequest rejects callers that change the inflight request contract", () => {
  const cacheSlot = "dedupe-transform-mismatch";
  const errors: string[] = [];
  setInflightEntry(cacheSlot, {
    promise: Promise.resolve({ value: 1 }),
    raw: Promise.resolve({ value: 1 }),
    cloneResult: "none",
    contract: {
      requestKind: "url",
      url: "https://api.example.com/one",
      method: "GET",
      responseType: "auto",
    },
  });

  try {
    const deduped = tryDedupeRequest("dedupe", cacheSlot, {
      contract: {
        requestKind: "url",
        url: "https://api.example.com/two",
        method: "GET",
        responseType: "auto",
      },
      cloneResult: "none",
    }, (message) => {
      errors.push(message);
    });

    assert.strictEqual(deduped, null);
    assert.ok(errors.some((message) => message.includes("different request or state contracts")));
  } finally {
    clearInflightEntry(cacheSlot);
  }
});

test("tryDedupeRequest rejects callers that change the inflight result contract", () => {
  const cacheSlot = "dedupe-result-mismatch";
  const errors: string[] = [];
  const transform = (raw: { value: number }) => raw.value + 1;
  setInflightEntry(cacheSlot, {
    promise: Promise.resolve(2),
    raw: Promise.resolve({ value: 1 }),
    transform,
    cloneResult: "none",
    contract: {
      requestKind: "url",
      url: "https://api.example.com/value",
      method: "GET",
      responseType: "auto",
    },
  });

  try {
    const deduped = tryDedupeRequest("dedupe", cacheSlot, {
      contract: {
        requestKind: "url",
        url: "https://api.example.com/value",
        method: "GET",
        responseType: "auto",
      },
      cloneResult: "deep",
    }, (message) => {
      errors.push(message);
    });

    assert.strictEqual(deduped, null);
    assert.ok(errors.some((message) => message.includes("different result contracts")));
  } finally {
    clearInflightEntry(cacheSlot);
  }
});

test("throwAsyncUsageError uses critical path when dev is disabled", () => {
  const globalWithDevFlag = globalThis as typeof globalThis & { __STROID_DEV__?: boolean };
  const originalDev = globalWithDevFlag.__STROID_DEV__;
  globalWithDevFlag.__STROID_DEV__ = false;
  try {
    assert.throws(() => {
      throwAsyncUsageError("usageError", "usage boom");
    }, /usage boom/);
  } finally {
    globalWithDevFlag.__STROID_DEV__ = originalDev;
  }
});
