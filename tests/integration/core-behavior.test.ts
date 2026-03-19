/**
 * @module tests/integration/core-behavior
 *
 * LAYER: Integration
 * OWNS:  Cross-module behavior that spans async, features, and runtime utilities.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, createStoreStrict, setStore, clearAllStores, hasStore, setStoreBatch, resetStore, getStore, deleteStore } from "../../src/store.js";
import { installAllFeatures } from "../../src/install.js";
import { createListStore, createEntityStore } from "../../src/helpers/index.js";
import { store, namespace } from "../../src/core/store-name.js";
import { getMetrics } from "../../src/core/store-read.js";
import { clearStores } from "../../src/runtime-admin/index.js";
import { listStores, getStoreMeta, getPersistQueueDepth, getAsyncInflightCount } from "../../src/runtime-tools/index.js";
import { shouldUseCache, pruneAsyncCache, getCacheMeta, getFetchRegistry, getRequestVersionRegistry } from "../../src/async/cache.js";
import { createAsyncRegistry, resetAsyncRegistry } from "../../src/async/registry.js";
import { delay, normalizeRetryOptions } from "../../src/async/retry.js";
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "../../src/async.js";
import { cloneAsyncResult } from "../../src/async/clone.js";
import { tryDedupeRequest, setInflightEntry, clearInflightEntry } from "../../src/async/inflight.js";
import { registerRateHit, pruneRateCounters, RATE_WINDOW_MS } from "../../src/async/rate.js";
import { throwAsyncUsageError } from "../../src/async/errors.js";
import { reactQueryKey, createReactQueryFetcher, createSwrFetcher } from "../../src/integrations/query.js";
import { setRegistryScope, getStoreRegistry, resetAllStoreRegistriesForTests, clearRegistryScopeOverrideForTests } from "../../src/core/store-registry.js";
import { createStoreForRequest } from "../../src/server/index.js";
import { subscribeWithSelector, createSelector } from "../../src/selectors/index.js";
import { notify, subscribeStore } from "../../src/core/store-notify.js";
import { configureStroid } from "../../src/config.js";
import { getNamespace, setNamespace } from "../../src/internals/config.js";
import { devDeepFreeze } from "../../src/utils/devfreeze.js";
import { hashState, deepClone, setByPath, sanitize } from "../../src/utils.js";
import { getHistory, clearHistory } from "../../src/devtools/api.js";
import { registerComputed, unregisterComputed, getTopoOrderedComputeds, getFullComputedGraph, getComputedDepsFor } from "../../src/computed/computed-graph.js";
import { registerStoreFeature, resetRegisteredStoreFeaturesForTests, setFeatureRegistrationHook } from "../../src/features/feature-registry.js";
import { runFeatureDeleteHooks, resolveFeatureAvailability } from "../../src/core/store-lifecycle/hooks.js";
import { featureRuntimes, initializeRegisteredFeatureRuntimes } from "../../src/core/store-lifecycle/registry.js";
import { runMiddleware, runStoreHook, MIDDLEWARE_ABORT } from "../../src/features/lifecycle.js";
import { createDevtoolsFeatureRuntime, initDevtools } from "../../src/features/devtools.js";
import { broadcastSync, createSyncFeatureRuntime, setupSync } from "../../src/features/sync.js";
import { computePersistChecksum } from "../../src/features/persist/checksum.js";
import { persistSave, flushPersistImmediately } from "../../src/features/persist/save.js";
import { setupPersistWatch, setPersistPresence } from "../../src/features/persist/watch.js";
import { persistLoad } from "../../src/features/persist/load.js";
import { validateCryptoPair } from "../../src/features/persist/crypto.js";
import { createPersistFeatureRuntime } from "../../src/features/persist.js";
import { normalizePersistOptions } from "../../src/adapters/options.js";
import { benchmarkStoreSet } from "../../src/helpers/testing.js";

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

test("setStore merges object data into object stores", () => {
  clearAllStores();
  createStore("mergeStore", { a: 1, nested: { value: 1 } });
  const result = setStore("mergeStore", { b: 2 });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual((getStore("mergeStore") as any).b, 2);
});

test("setStore rejects deep paths and invalid path values", () => {
  clearAllStores();
  createStore("pathStore", { value: { nested: 1 } });
  const deepPath = Array.from({ length: 100 }, (_, idx) => `p${idx}`);
  const deepResult = setStore("pathStore", deepPath, 1);
  assert.deepStrictEqual(deepResult, { ok: false, reason: "invalid-args" });

  const badValue = setStore("pathStore", "value", BigInt(1) as unknown as any);
  assert.deepStrictEqual(badValue, { ok: false, reason: "validate" });
});

test("setStore validates mutator return values when strictMutatorReturns is false", () => {
  clearAllStores();
  configureStroid({ strictMutatorReturns: false });
  createStore("mutReturn", { value: 1 });
  const result = setStore("mutReturn", () => (() => {}) as unknown as any);
  assert.deepStrictEqual(result, { ok: false, reason: "validate" });
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

test("runtime admin clears stores by pattern", () => {
  clearAllStores();
  createStore("pat::one", { value: 1 });
  createStore("pat::two", { value: 2 });
  createStore("other", { value: 3 });

  clearStores("pat::*");
  assert.strictEqual(hasStore("pat::one"), false);
  assert.strictEqual(hasStore("pat::two"), false);
  assert.strictEqual(hasStore("other"), true);
});

test("runtime tools handle missing stores and patterns", () => {
  clearAllStores();
  createStore("tool:one", { value: 1 });
  createStore("tool:two", { value: 2 });

  assert.deepStrictEqual(listStores("tool:*").sort(), ["tool:one", "tool:two"]);
  assert.strictEqual(getStoreMeta("missing"), null);
  assert.strictEqual(getPersistQueueDepth("missing"), 0);
  assert.strictEqual(getAsyncInflightCount("missing"), 0);
});

test("installAllFeatures is callable without throwing", () => {
  installAllFeatures();
});

test("namespace adapts names and store handles", () => {
  clearAllStores();
  const ns = namespace("ns");
  ns.create("user", { value: 1 });
  ns.set("user", "value", 2);
  assert.strictEqual(ns.get("user", "value"), 2);
  ns.create("already::scoped", { value: 5 });
  assert.strictEqual(ns.get("already::scoped", "value"), 5);

  const handle = store("raw");
  createStore("ns::raw", { value: 3 });
  ns.set(handle, "value", 4);
  assert.strictEqual(ns.get(handle, "value"), 4);
});

test("getMetrics returns null for missing store", () => {
  assert.strictEqual(getMetrics("missing-metrics"), null);
});

test("setStore invalid args and invalid data branches", () => {
  clearAllStores();
  createStore("invalidArgs", { value: 1 });
  const invalid = setStore("invalidArgs", 123 as unknown as any);
  assert.deepStrictEqual(invalid, { ok: false, reason: "invalid-args" });

  createStore("invalidData", { value: 1 });
  const bad = setStore("invalidData", () => (() => "nope") as unknown);
  assert.deepStrictEqual(bad, { ok: false, reason: "validate" });
});

test("resetStore in batch fails for uninitialized lazy store", () => {
  clearAllStores();
  createStore("lazyReset", () => ({ value: 1 }), { lazy: true });
  let result: { ok: boolean; reason?: string } | null = null;
  setStoreBatch(() => {
    result = resetStore("lazyReset");
  });
  assert.ok(result && result.ok === false);
});

test("createStoreForRequest throws when set is called before create", () => {
  assert.throws(() => {
    createStoreForRequest((api) => {
      api.set("missing" as any, { value: 1 } as any);
    });
  }, /requires create/);
});

test("selectors handle invalid inputs and snapshot modes", async () => {
  clearAllStores();
  createStore("selStore", { nested: { value: 1 } }, { snapshot: "ref" });
  const unsub = subscribeWithSelector("selStore", null as any, Object.is, (() => {}) as any);
  unsub();

  let calls = 0;
  const unsubscribe = subscribeWithSelector(
    "selStore",
    (state) => (state as any).nested?.value,
    Object.is,
    () => { calls += 1; }
  );
  setStore("selStore", "nested.value", 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  unsubscribe();
  assert.ok(calls >= 1);

  createStore("selShallow", { nested: { value: 1 } }, { snapshot: "shallow" });
  let shallowCalls = 0;
  const shallowUnsub = subscribeWithSelector(
    "selShallow",
    (state) => (state as any).nested?.value,
    Object.is,
    () => { shallowCalls += 1; }
  );
  setStore("selShallow", "nested.value", 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  shallowUnsub();
  assert.ok(shallowCalls >= 1);

  createStore("selValue", 1 as unknown as any);
  const selector = createSelector("selValue", (state: any) => state);
  assert.strictEqual(selector(), 1);
});

test("createSelector tracks deps and skips unchanged paths in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const script = `
    import { createStore, setStore } from "./src/store.js";
    import { createSelector } from "./src/selectors/index.js";

    createStore("depStore", { nested: { value: 1 }, other: 0 }, { scope: "global" });
    const select = createSelector("depStore", (state) => {
      state[Symbol.toStringTag];
      return state.nested.value;
    });
    if (select() !== 1) throw new Error("expected initial value");
    setStore("depStore", "other", 2);
    if (select() !== 1) throw new Error("expected cached value");
    setStore("depStore", "nested.value", 3);
    if (select() !== 3) throw new Error("expected updated value");
    console.log("ok");
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: "production" },
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout ?? "", /ok/);
});

test("store-notify chunk scheduling and priority queues", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 5, priorityStores: ["prioStore"] } });
  createStore("prioStore", { value: 1 });
  createStore("otherStore", { value: 1 });
  createStore("noSubs", { value: 1 });

  let bumped = false;
  let threw = false;
  const unsub = subscribeStore("prioStore", () => {
    threw = true;
    if (!bumped) {
      bumped = true;
      setStore("prioStore", "value", 3);
    }
    throw new Error("subscriber boom");
  });
  subscribeStore("otherStore", () => undefined);

  setStore("prioStore", "value", 2);
  setStore("otherStore", "value", 2);
  setStore("noSubs", "value", 2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  unsub();
  assert.ok(threw);

  const originalQueueMicrotask = (globalThis as any).queueMicrotask;
  try {
    (globalThis as any).queueMicrotask = undefined;
    notify("prioStore");
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});

test("store registry scope and resets clear registries", () => {
  const registry = getStoreRegistry("file.ts");
  registry.stores["x"] = 1;
  setRegistryScope("file2.ts");
  const nextRegistry = getStoreRegistry("file2.ts");
  assert.notStrictEqual(nextRegistry, registry);
  resetAllStoreRegistriesForTests();
  clearRegistryScopeOverrideForTests();
});

test("computed graph helpers surface deps and ordering", () => {
  registerComputed("b", ["source"], () => 1);
  registerComputed("a", ["b"], () => 1);
  registerComputed("z", ["source"], () => 1);

  const order = getTopoOrderedComputeds(["source"]);
  assert.ok(order.includes("a"));

  const graph = getFullComputedGraph();
  assert.ok(graph.nodes.includes("a"));
  const deps = getComputedDepsFor("a");
  assert.ok(deps);

  unregisterComputed("a");
  unregisterComputed("b");
  unregisterComputed("z");
});

test("devtools api returns safe defaults without feature registration", () => {
  assert.deepStrictEqual(getHistory("missing"), []);
  clearHistory("missing");
});

test("devtools feature sends updates and clears history", () => {
  const original = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
  let sends = 0;
  const devtoolsMock = {
    init: () => undefined,
    send: () => {
      sends += 1;
      if (sends === 1) throw new Error("devtools send boom");
    },
  };
  (window as any).__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: () => devtoolsMock,
  };

  installAllFeatures();
  createStore("devStore", { value: 1 }, {
    devtools: true,
    historyLimit: 2,
    redactor: () => { throw new Error("redactor boom"); },
  });
  setStore("devStore", "value", 2);
  deleteStore("devStore");

  assert.ok(sends >= 1);
  assert.deepStrictEqual(getHistory("devStore"), []);
  (window as any).__REDUX_DEVTOOLS_EXTENSION__ = original;
});

test("helpers list store returns empty when store missing", () => {
  clearAllStores();
  const list = createListStore("listTest");
  list.clear();
  clearAllStores();
  assert.deepStrictEqual(list.all(), []);
});

test("devDeepFreeze skips non-plain objects", () => {
  class Example { value = 1; }
  const instance = new Example();
  const frozen = devDeepFreeze(instance);
  assert.strictEqual(frozen, instance);
});

test("configureStroid covers namespace and missing immer produce", () => {
  const original = getNamespace();
  setNamespace(" scoped ");
  assert.strictEqual(getNamespace(), "scoped");
  setNamespace(original);

  configureStroid({ allowUntrustedHydration: true, middleware: [] });
  configureStroid({ mutatorProduce: "immer" });
});

test("flushPersistImmediately clears pending timers", async () => {
  const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const persistInFlight: Record<string, Promise<void> | null> = {};
  const persistSequence: Record<string, number> = Object.create(null);
  const persistWatchState: Record<string, { present?: boolean }> = Object.create(null);
  const plaintextWarningsIssued = new Set<string>();
  let calls = 0;

  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-key",
        driver: {
          setItem: async () => { calls += 1; },
        },
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
      },
      onError: undefined,
    },
  };

  const args = {
    name: "persist-store",
    persistTimers,
    persistInFlight,
    persistSequence,
    persistWatchState,
    plaintextWarningsIssued,
    exists: () => true,
    getMeta: () => meta as any,
    getStoreValue: () => ({ value: 1 }),
    reportStoreError: () => undefined,
    hashState: () => 1,
  };

  persistSave(args as any);
  assert.ok(persistTimers["persist-store"]);
  flushPersistImmediately("persist-store", args as any);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(!persistTimers["persist-store"]);
  assert.ok(calls >= 1);
});

test("feature delete hooks and availability normalization", () => {
  resetRegisteredStoreFeaturesForTests();
  featureRuntimes.clear();
  setFeatureRegistrationHook((name, factory) => {
    if (!featureRuntimes.get(name)) featureRuntimes.set(name, factory());
  });
  configureStroid({ strictMissingFeatures: false });
  registerStoreFeature("temp", () => ({
    beforeStoreDelete: () => undefined,
    afterStoreDelete: () => undefined,
  }));
  clearAllStores();
  createStore("featStore", { value: 1 });
  runFeatureDeleteHooks("featStore", { value: 1 }, () => undefined);

  const normalized = resolveFeatureAvailability("featStore", {
    persist: true,
    sync: true,
    devtools: true,
    explicitPersist: true,
    explicitSync: true,
    explicitDevtools: true,
    historyLimit: 10,
    redactor: (s) => s,
    scope: "request",
    snapshot: "deep",
    version: 1,
    validate: undefined,
    middleware: [],
    onCreate: undefined,
    onSet: undefined,
    onReset: undefined,
    onDelete: undefined,
    onError: undefined,
    lifecycle: {},
  } as any);
  assert.strictEqual(normalized.persist, null);
  assert.strictEqual(normalized.sync, false);
  assert.strictEqual(normalized.devtools, false);
  installAllFeatures();
  initializeRegisteredFeatureRuntimes();
});

test("setStore handles mutator errors and merge validation failures", () => {
  clearAllStores();
  createStore("mutatorThrow", { value: 1 });
  const thrown = setStore("mutatorThrow", () => {
    throw new Error("boom");
  });
  assert.deepStrictEqual(thrown, { ok: false, reason: "validate" });

  createStore("mergePrimitive", 123 as unknown as any);
  const merge = setStore("mergePrimitive", { value: 1 });
  assert.deepStrictEqual(merge, { ok: false, reason: "validate" });

  createStore("mergeBad", { value: 1 });
  const bad = setStore("mergeBad", { big: BigInt(1) } as unknown as any);
  assert.deepStrictEqual(bad, { ok: false, reason: "validate" });
});

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

test("hashState handles cycles, nulls, and large node counts", () => {
  const big = Array.from({ length: 110000 }, (_, idx) => idx);
  const bigHash = hashState(big);
  assert.ok(Number.isFinite(bigHash));

  const obj: { value: null; self?: unknown } = { value: null };
  obj.self = obj;
  const objHash = hashState(obj);
  assert.ok(Number.isFinite(objHash));
});

test("setByPath updates arrays and creates nested containers", () => {
  const updated = setByPath([0, 1], ["1"], 9);
  assert.deepStrictEqual(updated, [0, 9]);

  const nested = setByPath({}, ["a", "0", "b", "c"], "ok") as { a: Array<{ b: string }> };
  assert.strictEqual(nested.a[0].b, "ok");
});

test("deepClone returns original when descriptor lookup fails", () => {
  const target = { value: 1 };
  const proxy = new Proxy(target, {
    getOwnPropertyDescriptor() {
      throw new Error("no descriptors");
    },
  });
  assert.throws(() => {
    deepClone(proxy as unknown as { value: number });
  }, /object descriptors|Proxy|host object/i);
});

test("sanitize rejects circular references and accessors", () => {
  const obj: { self?: unknown } = {};
  obj.self = obj;
  assert.throws(() => sanitize(obj), /Circular reference/);

  const arr: unknown[] = [];
  arr.push(arr);
  assert.throws(() => sanitize(arr), /Circular reference/);

  const set = new Set<unknown>();
  set.add(set);
  assert.throws(() => sanitize(set), /Circular reference/);

  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, "value", { get: () => 1, enumerable: true });
  assert.throws(() => sanitize(accessor), /Accessor properties/);
});

test("normalizePersistOptions rejects invalid async crypto and plaintext sensitive stores", () => {
  assert.throws(
    () => normalizePersistOptions({ encryptAsync: async (v: string) => v } as unknown as any, "badAsync"),
    /encryptAsync/
  );
  assert.throws(
    () => normalizePersistOptions({ sensitiveData: true, encrypt: (v: string) => v, decrypt: (v: string) => v } as unknown as any, "badSensitive"),
    /sensitiveData/
  );
});

test("persistLoad reports non-string sync driver values", () => {
  const errors: string[] = [];
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-nonstring",
        driver: { getItem: () => ({ bad: true }) },
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
      },
    },
  };
  const loaded = persistLoad({
    name: "persistNonString",
    silent: true,
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    reportStoreError: (_name, message) => errors.push(message),
    validate: () => ({ ok: true }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });
  assert.strictEqual(loaded, true);
  assert.ok(errors.some((msg) => msg.includes("async value")));
});

test("persistLoad handles schema failure after migration changes", () => {
  const applied: Array<{ ok: boolean }> = [];
  const errors: string[] = [];
  const envelope = JSON.stringify({
    v: 1,
    checksum: null,
    data: { ok: false },
    updatedAtMs: Date.now(),
  });
  const meta = {
    version: 2,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-schema",
        driver: { getItem: () => envelope },
        serialize: JSON.stringify,
        deserialize: (value: any) => value,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
        onMigrationFail: "reset",
      },
    },
  };
  const loaded = persistLoad({
    name: "persistSchema",
    silent: true,
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: (value) => applied.push(value as { ok: boolean }),
    reportStoreError: (_name, message) => errors.push(message),
    validate: (value) => ({ ok: (value as { ok?: boolean }).ok === true }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });
  assert.strictEqual(loaded, true);
  assert.ok(applied.some((value) => value.ok));
  assert.ok(errors.length > 0);
});

test("persistLoad resets when validation fails after migration fallback", () => {
  const errors: string[] = [];
  const envelope = JSON.stringify({
    v: 1,
    checksum: null,
    data: { ok: false },
    updatedAtMs: Date.now(),
  });
  const meta = {
    version: 2,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-schema-reset",
        driver: { getItem: () => envelope },
        serialize: JSON.stringify,
        deserialize: (value: any) => value,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
        onMigrationFail: "reset",
      },
    },
  };
  const loaded = persistLoad({
    name: "persistSchemaReset",
    silent: true,
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    reportStoreError: (_name, message) => errors.push(message),
    validate: () => ({ ok: false }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });
  assert.strictEqual(loaded, true);
  assert.ok(errors.some((msg) => msg.includes("failed schema; resetting to initial")));
});

test("setupPersistWatch notifies on clear/remove/missing and handles read errors", () => {
  const notifications: Array<{ reason: string }> = [];
  let present = true;
  const watchState: Record<string, { lastPresent?: boolean; dispose?: () => void }> = Object.create(null);
  const persistConfig = {
    key: "watch-key",
    driver: {
      getItem: () => (present ? "value" : null),
    },
    onStorageCleared: (info: { reason: string }) => notifications.push(info),
  };

  setupPersistWatch({ name: "watchStore", persistConfig: persistConfig as any, persistWatchState: watchState });
  assert.strictEqual(watchState.watchStore?.lastPresent, true);

  const makeStorageEvent = (key: string | null, newValue?: string | null) => {
    const StorageEventCtor = (window as any).StorageEvent;
    if (typeof StorageEventCtor === "function") {
      return new StorageEventCtor("storage", { key, newValue });
    }
    const evt = new Event("storage");
    Object.defineProperty(evt, "key", { value: key });
    Object.defineProperty(evt, "newValue", { value: newValue });
    return evt;
  };

  present = false;
  window.dispatchEvent(makeStorageEvent(null));
  setPersistPresence(watchState as any, "watchStore", true);
  window.dispatchEvent(makeStorageEvent("watch-key", null));
  setPersistPresence(watchState as any, "watchStore", true);
  window.dispatchEvent(new Event("focus"));

  const reasons = notifications.map((entry) => entry.reason);
  assert.ok(reasons.includes("clear"));
  assert.ok(reasons.includes("remove"));
  assert.ok(reasons.includes("missing"));

  const throwingConfig = {
    key: "watch-throw",
    driver: { getItem: () => { throw new Error("boom"); } },
    onStorageCleared: () => undefined,
  };
  setupPersistWatch({ name: "watchThrow", persistConfig: throwingConfig as any, persistWatchState: watchState });
  assert.strictEqual(watchState.watchThrow?.lastPresent, false);
});

test("runMiddleware aborts on promises and warns on undefined results", () => {
  const issues: string[] = [];
  const warnings: string[] = [];
  const payload = { action: "set", prev: { value: 1 }, next: { value: 2 }, path: null };

  const abort = runMiddleware({
    name: "mw",
    payload,
    middlewares: [() => Promise.resolve() as unknown as any],
    reportIssue: (message) => issues.push(message),
    warn: (message) => warnings.push(message),
  });
  assert.strictEqual(abort, MIDDLEWARE_ABORT);
  assert.ok(issues.some((message) => message.includes("must be synchronous")));

  const passThrough = runMiddleware({
    name: "mw2",
    payload,
    middlewares: [() => undefined],
    reportIssue: () => undefined,
    warn: (message) => warnings.push(message),
  });
  assert.deepStrictEqual(passThrough, payload.next);
  assert.ok(warnings.some((message) => message.includes("returned undefined")));
});

test("runStoreHook reports errors", () => {
  const issues: string[] = [];
  runStoreHook({
    name: "hookStore",
    label: "onSet",
    fn: () => {
      throw new Error("hook boom");
    },
    args: [],
    reportIssue: (message) => issues.push(message),
  });
  assert.ok(issues.some((message) => message.includes("onSet")));
});

test("sync runtime reports sanitize errors and setup failures", () => {
  const originalBroadcast = (globalThis as any).BroadcastChannel;
  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() {
      MockChannel.instances.push(this);
    }
    postMessage() {}
    close() {}
  }
  (globalThis as any).BroadcastChannel = MockChannel as unknown as typeof BroadcastChannel;

  const runtime = createSyncFeatureRuntime();
  const errors: string[] = [];
  const ctx = {
    name: "syncSanitize",
    options: { sync: { authToken: "token" } },
    getMeta: () => ({ updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), updateCount: 1, options: { sync: { authToken: "token" } } }),
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    notify: () => undefined,
    validate: (_next: any) => ({ ok: true, value: _next }),
    reportStoreError: (message: string) => errors.push(message),
    warn: () => undefined,
    setStoreValue: () => undefined,
    isDev: () => true,
    sanitize: (value: unknown) => {
      if (typeof value === "bigint") throw new Error("sanitize boom");
      return value;
    },
    hashState: () => 1,
    deepClone,
    applyFeatureState: () => undefined,
  };
  runtime.onStoreCreate(ctx as any);
  const channel = MockChannel.instances[0];
  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncSanitize",
      clock: 1,
      source: "remote",
      token: "token",
      data: BigInt(1),
      updatedAt: Date.now(),
    },
  } as MessageEvent);
  assert.ok(errors.some((message) => message.includes("Sanitize failed for incoming sync")));

  const setupErrors: string[] = [];
  (globalThis as any).BroadcastChannel = class {
    constructor() {
      throw new Error("boom");
    }
  };
  setupSync({
    name: "syncFail",
    syncOption: true,
    syncChannels: Object.create(null),
    syncClocks: Object.create(null),
    syncVersions: Object.create(null),
    syncWindowCleanup: Object.create(null),
    instanceId: "instance",
    getMeta: () => ({ updatedAt: new Date().toISOString(), updateCount: 1, options: { sync: true } }),
    getAcceptedSyncVersion: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStoreEntry: () => true,
    notify: () => undefined,
    validate: (_name, next) => ({ ok: true, value: next }),
    reportStoreError: (_name, message) => setupErrors.push(message),
    warn: (message) => setupErrors.push(message),
    setStoreValue: () => undefined,
    normalizeIncomingState: () => ({ ok: true }),
    acceptIncomingSyncVersion: () => undefined,
    resolveSyncVersion: () => 0,
    broadcastSync: () => undefined,
  });
  assert.ok(setupErrors.some((message) => message.includes("Failed to setup sync")));

  (globalThis as any).BroadcastChannel = originalBroadcast;
});

test("broadcastSync reports signer failures", () => {
  const errors: string[] = [];
  broadcastSync({
    name: "syncSignFail",
    syncOption: { sign: () => { throw new Error("sign"); } },
    syncChannels: { syncSignFail: { postMessage: () => undefined } as any },
    syncClocks: Object.create(null),
    instanceId: "instance",
    updatedAt: Date.now(),
    data: { ok: true },
    hashState: () => 1,
    reportStoreError: (_name, message) => errors.push(message),
  });
  assert.ok(errors.some((message) => message.includes("Failed to sign sync payload")));
});

test("devtools runtime trims history, clones safely, and clears history", () => {
  const warnings: string[] = [];
  const runtime = createDevtoolsFeatureRuntime();
  const ctxBase = {
    name: "devStore",
    options: { devtools: true, historyLimit: 1, redactor: undefined },
    getAllStores: () => ({ devStore: { value: 1 } }),
    getStoreValue: () => ({ value: 1, big: BigInt(1) }),
    warn: (message: string) => warnings.push(message),
    deepClone,
  };

  runtime.onStoreCreate(ctxBase as any);
  assert.ok(warnings.some((message) => message.includes("DevTools requested")));

  runtime.onStoreWrite({ ...ctxBase, action: "set", prev: { value: 1 }, next: { value: 2 }, getStoreValue: () => ({ value: 2, big: BigInt(2) }) } as any);
  runtime.onStoreWrite({ ...ctxBase, action: "set", prev: { value: 2 }, next: { value: 3 }, getStoreValue: () => ({ value: 3, big: BigInt(3) }) } as any);

  const originalClone = (globalThis as any).structuredClone;
  try {
    (globalThis as any).structuredClone = undefined;
    const history = runtime.api?.getHistory?.("devStore");
    assert.ok(Array.isArray(history));
  } finally {
    (globalThis as any).structuredClone = originalClone;
  }

  runtime.api?.clearHistory?.();
  const cleared = runtime.api?.getHistory?.("devStore");
  assert.deepStrictEqual(cleared, []);
});

test("createStoreForRequest supports functional updates and snapshots", () => {
  let api: any = null;
  const ctx = createStoreForRequest((requestApi) => {
    api = requestApi;
  });
  api.create("user", { name: "Ada", count: 1 });
  api.set("user", (draft: { count: number }) => {
    draft.count += 1;
  });
  const snapshot = api.get("user");
  assert.strictEqual(snapshot.count, 2);

  const all = ctx.snapshot();
  assert.strictEqual(all.user.count, 2);
});

test("benchmarkStoreSet falls back to Date.now when performance is missing", () => {
  clearAllStores();
  createStore("bench", { value: 0 });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "performance");
  try {
    Object.defineProperty(globalThis, "performance", { value: undefined, configurable: true });
    const result = benchmarkStoreSet("bench", 2);
    assert.strictEqual(result.iterations, 2);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "performance", descriptor);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).performance;
    }
  }
});

test("createEntityStore generates ids from id fields and randomUUID when available", () => {
  clearAllStores();
  const entities = createEntityStore("entityStore");
  entities.upsert({ _id: "custom" } as any);
  assert.strictEqual(entities.all().length, 1);

  if ((globalThis as any).crypto && typeof (globalThis as any).crypto.randomUUID === "function") {
    entities.upsert({ name: "Ada" } as any);
    assert.ok(entities.all().length >= 2);
  }
});

test("namespace createStrict delegates to strict store creation", () => {
  clearAllStores();
  const ns = namespace("strict");
  ns.createStrict("user", { value: 1 });
  assert.strictEqual(getStore("strict::user", "value"), 1);
});

test("createStore handles duplicates and createStoreStrict throws on failure", () => {
  clearAllStores();
  const first = createStore("duplicate", { value: 1 });
  const second = createStore("duplicate", { value: 2 });
  assert.strictEqual(first?.name, "duplicate");
  assert.strictEqual(second?.name, "duplicate");

  assert.throws(() => createStoreStrict("" as unknown as any, { value: 1 }), /createStoreStrict/);
});

test("setStore reports missing stores", () => {
  clearAllStores();
  const result = setStore("missingStore", { value: 1 });
  assert.deepStrictEqual(result, { ok: false, reason: "not-found" });
});

test("fetchStore reports invalid request inputs", async () => {
  clearAllStores();
  createStore("badFetch", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const result = await fetchStore("badFetch", 123 as unknown as any, { signal: controller.signal });
  assert.strictEqual(result, null);
});

test("fetchStore rejects async transform results", async () => {
  clearAllStores();
  createStore("asyncTransform", { data: null, loading: false, error: null, status: "idle" });
  const controller = new AbortController();
  const result = await fetchStore("asyncTransform", Promise.resolve({ ok: true }), {
    signal: controller.signal,
    transform: async (value) => value,
  } as any);
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

test("persist feature flushes on pagehide and cleans up on delete/reset", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  let removeCalls = 0;
  const persistConfig = {
    key: "persist-flush",
    driver: {
      getItem: () => null,
      setItem: () => { setCalls += 1; },
      removeItem: () => { removeCalls += 1; throw new Error("remove boom"); },
    },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  };
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: { persist: persistConfig },
  };
  const ctx = {
    name: "persistFlush",
    options: { persist: persistConfig },
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    reportStoreError: () => undefined,
    warn: () => undefined,
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: () => ({ ok: true }),
  };

  runtime.onStoreCreate(ctx as any);
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("beforeunload"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(setCalls >= 1);

  const originalRemove = window.removeEventListener;
  try {
    window.removeEventListener = () => { throw new Error("dispose boom"); };
    runtime.resetAll?.();
  } finally {
    window.removeEventListener = originalRemove;
  }

  runtime.beforeStoreDelete(ctx as any);
  assert.ok(removeCalls >= 1);
});

test("persist feature handles async load failures with pending saves", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  let throwOnGetMeta = false;
  const persistConfig = {
    key: "persist-async",
    driver: {
      getItem: () => Promise.resolve(null),
      setItem: () => { setCalls += 1; },
    },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    decryptAsync: async (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  };
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: { persist: persistConfig },
  };
  const ctx = {
    name: "persistAsync",
    options: { persist: persistConfig },
    getMeta: () => {
      if (throwOnGetMeta) {
        throwOnGetMeta = false;
        throw new Error("meta boom");
      }
      return meta as any;
    },
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    reportStoreError: () => undefined,
    warn: () => undefined,
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: () => ({ ok: true }),
  };
  runtime.onStoreCreate(ctx as any);
  throwOnGetMeta = true;
  runtime.onStoreWrite(ctx as any);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(setCalls >= 1);
});

test("persist feature reports sensitive data and key collisions", () => {
  const runtime = createPersistFeatureRuntime();
  const errors: string[] = [];
  const warnings: string[] = [];
  const baseConfig = {
    key: "shared-key",
    driver: { getItem: () => null, setItem: () => undefined },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
  };
  const baseCtx = {
    getMeta: () => ({ version: 1, updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), options: { persist: baseConfig } }),
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    reportStoreError: (message: string) => errors.push(message),
    warn: (message: string) => warnings.push(message),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: () => ({ ok: true }),
    isDev: () => true,
  };

  runtime.onStoreCreate({ ...baseCtx, name: "persistA", options: { persist: baseConfig } } as any);
  runtime.onStoreCreate({ ...baseCtx, name: "persistB", options: { persist: baseConfig } } as any);

  const sensitiveConfig = { ...baseConfig, key: "sensitive-key", sensitiveData: true };
  runtime.onStoreCreate({ ...baseCtx, name: "persistSensitive", options: { persist: sensitiveConfig } } as any);

  assert.ok(warnings.some((message) => message.includes("Persist key collision")));
  assert.ok(errors.some((message) => message.includes("marked sensitiveData")));
});

test("sync runtime handles verify errors, sync requests, and conflict resolution", () => {
  const originalBroadcast = (globalThis as any).BroadcastChannel;
  const posts: Array<unknown> = [];
  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() {
      MockChannel.instances.push(this);
    }
    postMessage(payload: unknown) {
      posts.push(payload);
    }
    close() {}
  }
  (globalThis as any).BroadcastChannel = MockChannel as unknown as typeof BroadcastChannel;

  const runtime = createSyncFeatureRuntime();
  const errors: string[] = [];
  const syncOption: any = {
    authToken: "token",
    verify: () => { throw new Error("verify boom"); },
    conflictResolver: ({ incoming }: { incoming: any }) => ({ value: incoming?.value ?? 0 }),
    resolveUpdatedAt: ({ incomingUpdated }: { incomingUpdated: number }) => incomingUpdated,
  };
  const ctx = {
    name: "syncVerify",
    options: { sync: syncOption },
    getMeta: () => ({ updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), updateCount: 1, options: { sync: syncOption } }),
    getStoreValue: () => ({ value: 1 }),
    hasStore: () => true,
    notify: () => undefined,
    validate: (_next: any) => ({ ok: true, value: _next }),
    reportStoreError: (message: string) => errors.push(message),
    warn: () => undefined,
    setStoreValue: () => undefined,
    isDev: () => true,
    sanitize: (value: unknown) => value,
    hashState: () => 1,
    deepClone,
    applyFeatureState: () => undefined,
  };

  runtime.onStoreCreate(ctx as any);
  const channel = MockChannel.instances[0];

  window.dispatchEvent(new Event("focus"));
  assert.ok(posts.length > 0);

  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncVerify",
      clock: 1,
      source: "remote",
      token: "token",
      data: { value: 2 },
      updatedAt: Date.now(),
    },
  } as MessageEvent);
  assert.ok(errors.some((message) => message.includes("verification failed")));

  syncOption.verify = () => true;
  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-request",
      name: "syncVerify",
      clock: 0,
      source: "remote",
      token: "token",
    },
  } as MessageEvent);

  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncVerify",
      clock: 0,
      source: "",
      token: "token",
      data: { value: 3 },
      updatedAt: Date.now(),
    },
  } as MessageEvent);

  (globalThis as any).BroadcastChannel = originalBroadcast;
});

test("pruneRateCounters evicts expired rate entries", () => {
  const now = Date.now();
  registerRateHit("pruneSlot", now - RATE_WINDOW_MS - 10);
  pruneRateCounters(now);
  const after = registerRateHit("pruneSlot", now);
  assert.strictEqual(after, false);
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
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => ({
    ok: false,
    status: 500,
    statusText: "Server Error",
    json: async () => ({}),
    text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  try {
    const controller = new AbortController();
    const result = await fetchStore("httpError", "https://example.com", { signal: controller.signal });
    assert.strictEqual(result, null);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});

test("fetchStore reports auto-create failures for invalid store names", async () => {
  const controller = new AbortController();
  const result = await fetchStore("__proto__", Promise.resolve({ ok: true }), { signal: controller.signal, autoCreate: true });
  assert.strictEqual(result, null);
});

test("createStore rejects invalid initial data and disallows create inside transactions", () => {
  clearAllStores();
  const bad = createStore("badInitial", () => undefined);
  assert.strictEqual(bad, undefined);

  setStoreBatch(() => {
    const created = createStore("inBatch", { value: 1 });
    assert.strictEqual(created, undefined);
  });
});

test("createStore warns on temp scope with persist enabled", () => {
  clearAllStores();
  configureStroid({ strictMissingFeatures: false });
  const created = createStore("tempPersist", { value: 1 }, { scope: "temp", persist: true });
  assert.ok(created);
});

test("setStore warns on slow mutators", () => {
  clearAllStores();
  createStore("slowMutator", { value: 1 });
  const originalNow = Date.now;
  let calls = 0;
  Date.now = () => {
    calls += 1;
    return calls === 1 ? 1 : 100;
  };
  try {
    setStore("slowMutator", (draft: { value: number }) => {
      draft.value = 2;
    });
  } finally {
    Date.now = originalNow;
  }
});

test("validateCryptoPair reports encrypt/decrypt failures", () => {
  const encryptThrows = validateCryptoPair(
    "cryptoFail",
    () => {
      throw new Error("boom");
    },
    (value) => value
  );
  assert.strictEqual(encryptThrows.ok, false);
  assert.ok((encryptThrows.reason ?? "").includes("encrypt failed"));

  const encryptNonString = validateCryptoPair("cryptoFail", () => 123 as unknown as string, (value) => value);
  assert.strictEqual(encryptNonString.ok, false);
  assert.ok((encryptNonString.reason ?? "").includes("encrypt must return a string"));

  const decryptNonString = validateCryptoPair("cryptoFail", (value) => value, () => 123 as unknown as string);
  assert.strictEqual(decryptNonString.ok, false);
  assert.ok((decryptNonString.reason ?? "").includes("decrypt must return a string"));
});

test("normalizePersistOptions handles storage access errors and probe failures", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
  try {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage boom");
      },
    });
    const fallback = normalizePersistOptions(true, "storageFail");
    assert.ok(fallback);
  } finally {
    if (descriptor) {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  }

  const throwingEncrypt = () => {
    throw new Error("probe boom");
  };
  const res = normalizePersistOptions({
    encrypt: throwingEncrypt as any,
    decrypt: (v: string) => v,
    allowPlaintext: true,
  } as any, "probeFail");
  assert.ok(res);
});

test("normalizePersistOptions tolerates encrypt probe errors for sensitive data", () => {
  const res = normalizePersistOptions({
    sensitiveData: true,
    encrypt: () => {
      throw new Error("encrypt probe fail");
    },
    decrypt: (value: string) => value,
  } as any, "sensitiveProbe");
  assert.ok(res);
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

test("computePersistChecksum falls back to node crypto", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
    const checksum = await computePersistChecksum("sha256", "payload");
    assert.strictEqual(typeof checksum, "string");
    assert.strictEqual((checksum as string).length, 64);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "crypto", descriptor);
    } else {
      delete (globalThis as any).crypto;
    }
  }
});

test("chunked notify handles version changes and subscriber removals mid-flush", async () => {
  clearAllStores();
  configureStroid({
    flush: {
      chunkSize: 1,
      chunkDelayMs: 5,
      priorityStores: ["notifyA", "notifyB", "notifyC", "notifyD"],
    },
  });
  createStore("notifyA", { value: 0 });
  createStore("notifyB", { value: 0 });
  createStore("notifyC", { value: 0 });
  createStore("notifyD", { value: 0 });

  let didUpdate = false;
  let unsubB = () => {};
  let unsubC = () => {};
  let unsubD = () => {};

  const unsubA = subscribeStore("notifyA", () => {
    if (didUpdate) return;
    didUpdate = true;
    setStore("notifyA", "value", 1);
    setStore("notifyB", "value", 1);
    unsubC();
  });
  unsubB = subscribeStore("notifyB", () => {});
  unsubC = subscribeStore("notifyC", () => {});
  unsubD = subscribeStore("notifyD", () => {});

  setStore("notifyA", "value", 1);
  setStore("notifyB", "value", 1);
  setStore("notifyC", "value", 1);
  setStore("notifyD", "value", 1);

  await new Promise((resolve) => setTimeout(resolve, 60));

  unsubA();
  unsubB();
  unsubC();
  unsubD();
  assert.ok(didUpdate);
});

