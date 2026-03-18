/**
 * @module tests/regression/regressions
 *
 * LAYER: Regression
 * OWNS:  Regression coverage for fixed production issues.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { configureStroid, resetConfig, registerMutatorProduce } from "../../src/config.js";
import { clearAllStores } from "../../src/runtime-admin/index.js";
import {
  createStore,
  deleteStore,
  getStore,
  getStoreSnapshot,
  hasStore,
  isLazyStore,
  isStoreMaterialized,
  isLazyPending,
  hydrateStores,
  replaceStore,
  resetStore,
  setStore,
  setStoreBatch,
  subscribe,
  _getSnapshot,
  _getStoreValueRef,
} from "../../src/store.js";
import { fetchStore } from "../../src/async/fetch.js";
import { getStoreMeta, getStoreHealth, findColdStores } from "../../src/runtime-tools/index.js";
import { clearSsrGlobalAllowWarned } from "../../src/core/store-create.js";
import { subscribeWithSelector } from "../../src/selectors/index.js";
import { broadcastSync } from "../../src/features/sync.js";
import { hashState, warn } from "../../src/utils.js";
import { createStoreRegistry, runWithRegistry, createTransactionState } from "../../src/core/store-registry.js";
import { stores, validatePathSafety, pathValidationCache, getStoreAdmin, getRegistry } from "../../src/core/store-lifecycle.js";
import { onStoreLifecycle } from "../../src/core/store-lifecycle/registry.js";
import { createStoreForRequest } from "../../src/server/index.js";
import { setComputedOrderResolver } from "../../src/internals/computed-order.js";
import { getTopoOrderedComputeds } from "../../src/computed/computed-graph.js";
import { createComputed } from "../../src/computed/index.js";
import { registerStoreFeature, resetRegisteredStoreFeaturesForTests } from "../../src/features/feature-registry.js";
import { registerHook } from "../../src/core/lifecycle-hooks.js";
import { buildFlushPlan } from "../../src/notification/priority.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { injectTransactionRunner, beginTransaction, endTransaction, stageTransactionValue, getStagedTransactionValue } from "../../src/core/store-transaction.js";

test("validator with side effects runs once per write", () => {
  clearAllStores();
  let calls = 0;
  createStore("x", { value: 0 }, {
    validate: (next) => {
      calls += 1;
      return (next as any).value >= 0;
    },
  });
  calls = 0;
  setStore("x", "value", 5);
  assert.strictEqual(calls, 1);
});

test("subscribeWithSelector does not fire on first notification", async () => {
  clearAllStores();
  createStore("x", { count: 0 });
  const calls: Array<[number, number]> = [];
  subscribeWithSelector(
    "x",
    (s: any) => s.count,
    Object.is,
    (next, prev) => calls.push([next as number, prev as number])
  );

  setStore("x", "count", 0);
  await Promise.resolve();
  assert.strictEqual(calls.length, 0);

  setStore("x", "count", 1);
  await Promise.resolve();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], [1, 0]);
});

test("validatePathSafety cache does not bypass type mismatch", () => {
  clearAllStores();
  createStore("x", { count: 0 });

  const base = stores["x"];
  const okNumber = validatePathSafety("x", base, "count", 1);
  assert.deepStrictEqual(okNumber, { ok: true });

  const badString = validatePathSafety("x", base, "count", "nope");
  assert.strictEqual(badString.ok, false);
});

test("validatePathSafety LRU caps verdict entries under high-cardinality paths", () => {
  clearAllStores();
  const items: Record<string, { value: number }> = {};
  const total = 700;
  for (let i = 0; i < total; i += 1) {
    items[`k${i}`] = { value: i };
  }

  createStore("lru", { items });
  const base = stores["lru"];

  for (let i = 0; i < total; i += 1) {
    validatePathSafety("lru", base, `items.k${i}.value`, i);
  }

  const root = pathValidationCache.get("lru") as any;
  const countVerdicts = (node: any): number => {
    if (!node) return 0;
    let count = 0;
    if (node.verdicts) count += node.verdicts.size;
    node.children?.forEach((child: any) => {
      count += countVerdicts(child);
    });
    return count;
  };

  const verdictCount = countVerdicts(root);
  assert.ok(verdictCount <= 500, `expected <= 500 verdicts, got ${verdictCount}`);
});

test("configureStroid pathCacheSize limits cached path verdicts per store", () => {
  clearAllStores();
  configureStroid({ pathCacheSize: 2 });

  try {
    createStore("pathLimit", { a: { v: 1 }, b: { v: 2 }, c: { v: 3 } });
    const base = stores["pathLimit"];

    validatePathSafety("pathLimit", base, "a.v", 1);
    validatePathSafety("pathLimit", base, "b.v", 2);
    validatePathSafety("pathLimit", base, "c.v", 3);

    const root = pathValidationCache.get("pathLimit") as any;
    const readVerdicts = (path: string): number => {
      const parts = path.split(".");
      let node = root;
      for (const part of parts) {
        node = node?.children?.get(part);
      }
      return node?.verdicts?.size ?? 0;
    };

    const verdicts = [readVerdicts("a.v"), readVerdicts("b.v"), readVerdicts("c.v")];
    const active = verdicts.filter((count) => count > 0).length;
    assert.ok(active <= 2, `expected <= 2 cached verdict nodes, got ${active}`);
  } finally {
    resetConfig();
  }
});

test("hydrateStores does not materialize lazy stores", () => {
  clearAllStores();
  let calls = 0;
  createStore("lazyHydrate", () => {
    calls += 1;
    return { count: 0 };
  }, { lazy: true });

  hydrateStores({ lazyHydrate: { count: 5 } }, {}, { allowUntrusted: true });
  assert.strictEqual(calls, 0);
  assert.deepStrictEqual(getStore("lazyHydrate"), { count: 5 });
});

test("hydrateStores accepts allowTrusted trust flag", () => {
  clearAllStores();
  const result = hydrateStores({ trustedHydrate: { value: 1 } }, {}, { allowTrusted: true });
  assert.ok(result.created.includes("trustedHydrate"));
  assert.deepStrictEqual(getStore("trustedHydrate"), { value: 1 });
});

test("hydrateStores throws when trust.validate throws in dev", () => {
  clearAllStores();
  assert.throws(() => {
    hydrateStores({ badTrust: { value: 1 } }, {}, {
      allowTrusted: true,
      validate: () => {
        throw new Error("validator boom");
      },
    });
  }, /trust\.validate threw/);
});

test("onStoreLifecycle emits created/deleted events and respects unsubscribe", () => {
  clearAllStores();
  const events: any[] = [];
  const off = onStoreLifecycle((event) => {
    events.push(event);
  });

  createStore("lifeGlobal", { value: 1 }, { scope: "global" });
  createStore("lifeTemp", { value: 2 }, { scope: "temp" });
  deleteStore("lifeGlobal");

  off();
  createStore("lifeIgnored", { value: 3 });

  const createdGlobal = events.find((entry) => entry.type === "created" && entry.name === "lifeGlobal");
  const createdTemp = events.find((entry) => entry.type === "created" && entry.name === "lifeTemp");
  const deletedGlobal = events.find((entry) => entry.type === "deleted" && entry.name === "lifeGlobal");

  assert.strictEqual(createdGlobal?.isGlobal, true);
  assert.strictEqual(createdGlobal?.isTemp, false);
  assert.strictEqual(createdTemp?.isGlobal, false);
  assert.strictEqual(createdTemp?.isTemp, true);
  assert.strictEqual(deletedGlobal?.name, "lifeGlobal");
  assert.ok(!events.some((entry) => entry.name === "lifeIgnored"));
});

test("replaceStore inside batch commits as part of the transaction", () => {
  clearAllStores();
  createStore("batchReplace", { value: 1 });

  let result: any;
  setStoreBatch(() => {
    result = replaceStore("batchReplace", { value: 2 });
  });

  assert.strictEqual(result?.ok, true);
  assert.deepStrictEqual(getStore("batchReplace"), { value: 2 });
});

test("setStoreBatch warns on promise-returning callbacks", async () => {
  clearAllStores();
  createStore("batchPromise", { value: 0 });
  const warnings: string[] = [];
  configureStroid({
    namespace: "",
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  try {
    setStoreBatch(() => {
      setStore("batchPromise", "value", 1);
      return Promise.resolve();
    });
    await Promise.resolve();
    assert.ok(warnings.some((msg) => msg.includes("promise-returning")));
    assert.deepStrictEqual(getStore("batchPromise"), { value: 0 });
  } finally {
    resetConfig();
  }
});

test("setStoreBatch warns on generator callbacks", () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  try {
    const gen = function* () {
      yield 1;
    };
    setStoreBatch(gen as unknown as () => void);
    assert.ok(warnings.some((msg) => msg.includes("generator")));
  } finally {
    resetConfig();
  }
});

test("slow mutator warning clears after store deletion", () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  const realNow = Date.now;
  let now = 0;
  Date.now = () => {
    now += 100;
    return now;
  };

  try {
    createStore("slow", { value: 0 });
    setStore("slow", (draft: any) => {
      draft.value += 1;
    });
    deleteStore("slow");
    createStore("slow", { value: 0 });
    setStore("slow", (draft: any) => {
      draft.value += 1;
    });
  } finally {
    Date.now = realNow;
    resetConfig();
  }

  const slowWarnings = warnings.filter((msg) => msg.includes("mutator") && msg.includes("took"));
  assert.strictEqual(slowWarnings.length, 2);
});

test("allowSSRGlobalStore warning can re-fire after delete", () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });
  const originalEnv = process.env.NODE_ENV;
  const realWindow = (globalThis as any).window;
  const realDocument = (globalThis as any).document;
  process.env.NODE_ENV = "production";
  (globalThis as any).window = undefined;
  (globalThis as any).document = undefined;

  try {
    createStore("ssrWarn", { value: 1 }, { scope: "global" });
    assert.strictEqual(hasStore("ssrWarn"), true);
    deleteStore("ssrWarn");
    assert.strictEqual(hasStore("ssrWarn"), false);
    clearSsrGlobalAllowWarned("ssrWarn");
    createStore("ssrWarn", { value: 1 }, { scope: "global" });
  } finally {
    process.env.NODE_ENV = originalEnv;
    (globalThis as any).window = realWindow;
    (globalThis as any).document = realDocument;
    resetConfig();
  }

  const ssrWarnings = warnings.filter((msg) => msg.includes("allowSSRGlobalStore"));
  assert.strictEqual(ssrWarnings.length, 2);
});

test("snapshot freezing differs by mode", () => {
  clearAllStores();
  createStore("snapDeep", { nested: { value: 1 } }, { snapshot: "deep" });
  createStore("snapRef", { nested: { value: 1 } }, { snapshot: "ref" });
  createStore("snapShallow", { nested: { value: 1 } }, { snapshot: "shallow" });

  const deepSnap = _getSnapshot("snapDeep");
  const refSnap = _getSnapshot("snapRef");
  const shallowSnap = _getSnapshot("snapShallow");

  assert.strictEqual(Object.isFrozen(deepSnap as object), true);
  assert.strictEqual(Object.isFrozen(refSnap as object), true);
  assert.strictEqual(Object.isFrozen(shallowSnap as object), true);
  assert.strictEqual(Object.isFrozen((deepSnap as any).nested), true);
  assert.strictEqual(Object.isFrozen((refSnap as any).nested), false);
  assert.strictEqual(Object.isFrozen((shallowSnap as any).nested), false);
});

test("concurrent setStore calls in the same microtask coalesce", async () => {
  clearAllStores();
  createStore("micro", { value: 0 });
  let calls = 0;
  let last: any = null;
  subscribe("micro", (value) => {
    calls += 1;
    last = value;
  });

  queueMicrotask(() => {
    setStore("micro", "value", 1);
    setStore("micro", "value", 2);
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(last, { value: 2 });
});

test("snapshot cache version batches per flush", async () => {
  clearAllStores();
  createStore("batchVersion", { value: 0 });
  subscribe("batchVersion", () => {});

  setStore("batchVersion", "value", 1);
  setStore("batchVersion", "value", 2);

  await new Promise((resolve) => setTimeout(resolve, 0));

  const registry = getRegistry();
  const cached = registry.snapshotCache["batchVersion"];
  assert.ok(cached);
  assert.strictEqual(cached.version, registry.notify.flushId);
  assert.strictEqual(registry.metaEntries["batchVersion"]?.updateCount, 2);
  assert.notStrictEqual(cached.version, registry.metaEntries["batchVersion"]?.updateCount);
});

test("fetchStore propagates correlationId through middleware and computed writes", async () => {
  clearAllStores();
  const seen: string[] = [];
  configureStroid({
    middleware: [({ name, correlationId }) => {
      if (correlationId) seen.push(`${name}:${correlationId}`);
    }],
  });

  try {
    createStore("orders", { data: null, loading: false, error: null, status: "idle" });
    createComputed("totals", ["orders"], (state) => ({
      value: (state as any)?.data?.value ?? 0,
    }));

    await fetchStore("orders", Promise.resolve({ value: 7 }), { correlationId: "corr-abc" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const meta = getStoreMeta("orders");
    assert.strictEqual(meta?.lastCorrelationId, "corr-abc");
    const asyncState = getStore("orders") as any;
    assert.strictEqual(asyncState?.correlationId, "corr-abc");
    assert.ok(seen.includes("orders:corr-abc"));
    assert.ok(seen.includes("totals:corr-abc"));
  } finally {
    resetConfig();
  }
});

test("fetchStore autoCorrelationIds generates ids when enabled", async () => {
  clearAllStores();
  configureStroid({ autoCorrelationIds: true });

  try {
    createStore("autoCorr", { data: null, loading: false, error: null, status: "idle" });
    await fetchStore("autoCorr", Promise.resolve({ value: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const meta = getStoreMeta("autoCorr");
    assert.ok(meta?.lastCorrelationId);
    assert.ok((meta?.lastCorrelationId ?? "").startsWith("stroid-autoCorr-"));
  } finally {
    resetConfig();
  }
});

test("getStoreSnapshot increments read counters", () => {
  clearAllStores();
  createStore("snapReads", { value: 1 });
  const before = getStoreMeta("snapReads");
  assert.strictEqual(before?.readCount, 0);

  getStoreSnapshot("snapReads");
  const after = getStoreMeta("snapReads");
  assert.strictEqual(after?.readCount, 1);
});

test("findColdStores flags cold and write-only stores", () => {
  clearAllStores();
  createStore("coldStore", { value: 0 });
  createStore("writeOnlyStore", { value: 0 });
  setStore("writeOnlyStore", "value", 1);
  createStore("activeStore", { value: 0 });
  getStore("activeStore");

  const reports = findColdStores({ includeWriteOnly: true, unreadThresholdMs: 60_000 });
  const byName = new Map(reports.map((r) => [r.name, r]));

  assert.strictEqual(byName.get("coldStore")?.verdict, "cold");
  assert.strictEqual(byName.get("writeOnlyStore")?.verdict, "write-only");
  assert.ok(!byName.has("activeStore"));
});

test("getStoreHealth returns per-store and global metrics", () => {
  clearAllStores();
  createStore("healthStore", { value: 1 });

  const entry = getStoreHealth("healthStore") as any;
  assert.strictEqual(entry?.name, "healthStore");
  assert.ok(entry?.meta);

  const summary = getStoreHealth() as any;
  assert.ok(Array.isArray(summary?.stores));
  assert.ok(summary?.registry?.totalStores >= 1);
});

test("bindRegistry preserves lazy factories across scope switches", () => {
  const registryA = createStoreRegistry();
  const registryB = createStoreRegistry();

  let calls = 0;
  runWithRegistry(registryA, () => {
    clearAllStores();
    createStore("lazy", () => {
      calls += 1;
      return { count: 1 };
    }, { lazy: true });
  });

  runWithRegistry(registryB, () => {
    clearAllStores();
    createStore("other", { ok: true });
  });

  runWithRegistry(registryA, () => {
    assert.deepStrictEqual(getStore("lazy"), { count: 1 });
  });
  assert.strictEqual(calls, 1);
});

test("runtime-admin clearAllStores clears the current registry scope", () => {
  const registry = createStoreRegistry();
  runWithRegistry(registry, () => {
    clearAllStores();
    createStore("scoped", { value: 1 });
    assert.strictEqual(hasStore("scoped"), true);

    clearAllStores();
    assert.strictEqual(hasStore("scoped"), false);
  });
});

test("getStoreAdmin returns per-registry admin instances", () => {
  const registryA = createStoreRegistry();
  const registryB = createStoreRegistry();

  const adminA = runWithRegistry(registryA, () => getStoreAdmin());
  const adminB = runWithRegistry(registryB, () => getStoreAdmin());

  assert.notStrictEqual(adminA, adminB);
});

test("transaction state is registry-scoped across request registries", () => {
  const reqA = createStoreForRequest((api) => {
    api.create("count", { value: 0 });
  });
  const reqB = createStoreForRequest((api) => {
    api.create("count", { value: 100 });
  });

  let resultB: any = null;
  const resultA = reqA.hydrate(() => {
    setStoreBatch(() => {
      setStore("count", { value: 1 });
      reqB.hydrate(() => {
        setStore("count", { value: 200 });
        resultB = getStore("count");
        return resultB;
      });
    });
    return getStore("count");
  });

  assert.deepStrictEqual(resultA, { value: 1 });
  assert.deepStrictEqual(resultB, { value: 200 });
});

test("setStore rejects path writes to primitive stores", () => {
  clearAllStores();
  createStore("count", 0);

  const res = setStore("count", "value", 1);
  assert.strictEqual(res.ok, false);
  assert.strictEqual((res as any).reason, "path");
});

test("chunked flush snapshots ordered names (orderedNames race)", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkDelayMs: 30 } });

  try {
    createStore("a", { value: 0 });
    createStore("b", { value: 0 });
    createStore("x", { value: 0 });

    const calls: string[] = [];
    subscribe("a", () => calls.push("a"));
    subscribe("b", () => calls.push("b"));

    setStore("a", "value", 1);
    setStore("b", "value", 1);

    // Let the initial microtask flush run the first store and schedule the next store via setTimeout.
    await Promise.resolve();
    assert.deepStrictEqual(calls, ["a"]);

    setStoreBatch(() => {
      setStore("x", "value", 1);
      throw new Error("boom");
    });

    await new Promise((r) => setTimeout(r, 120));
    assert.deepStrictEqual(calls, ["a", "b"]);
  } finally {
    resetConfig();
  }
});

test("inline flush defers subscribers added mid-flush until next write", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkDelayMs: 0, chunkSize: Number.POSITIVE_INFINITY } });

  try {
    createStore("inlineAdd", { value: 0 });
    const calls: string[] = [];
    let added = false;

    subscribe("inlineAdd", () => {
      calls.push("a");
      if (!added) {
        added = true;
        subscribe("inlineAdd", () => {
          calls.push("b");
        });
      }
    });

    setStore("inlineAdd", "value", 1);
    await Promise.resolve();
    assert.deepStrictEqual(calls, ["a"]);

    setStore("inlineAdd", "value", 2);
    await Promise.resolve();
    assert.deepStrictEqual(calls, ["a", "a", "b"]);
  } finally {
    resetConfig();
  }
});

test("chunked flush notifies subscribers added mid-flush", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 20 } });

  try {
    createStore("chunkedSubs", { value: 0 });
    const calls: string[] = [];
    let added = false;

    subscribe("chunkedSubs", () => {
      calls.push("a");
      if (!added) {
        added = true;
        subscribe("chunkedSubs", () => {
          calls.push("b");
        });
      }
    });

    setStore("chunkedSubs", "value", 1);

    await new Promise((r) => setTimeout(r, 80));

    assert.deepStrictEqual(calls, ["a", "b"]);
  } finally {
    resetConfig();
  }
});

test("setStoreBatch supports nested batches without duplicate notifications", async () => {
  clearAllStores();
  createStore("nestedBatch", { value: 0 });

  let calls = 0;
  subscribe("nestedBatch", () => { calls += 1; });

  setStoreBatch(() => {
    setStore("nestedBatch", "value", 1);
    setStoreBatch(() => {
      setStore("nestedBatch", "value", 2);
    });
    setStore("nestedBatch", "value", 3);
  });

  await Promise.resolve();
  assert.deepStrictEqual(getStore("nestedBatch"), { value: 3 });
  assert.strictEqual(calls, 1);
});

test("hydrateStores accepts undefined values in snapshots", () => {
  clearAllStores();
  createStore("defined", { value: 1 });

  const result = hydrateStores({
    defined: undefined as any,
    missing: undefined as any,
  }, {}, { allowUntrusted: true });

  assert.deepStrictEqual(result.hydrated.slice().sort(), []);
  assert.deepStrictEqual(result.created.slice().sort(), ["missing"]);
  const definedFailure = result.failed.find((entry) => entry.name === "defined");
  assert.strictEqual(definedFailure?.reason, "merge-failed");
  assert.strictEqual(definedFailure?.cause, "undefined");
  assert.strictEqual(hasStore("missing"), true);
  assert.deepStrictEqual(getStore("defined"), { value: 1 });
  assert.strictEqual(getStore("missing"), undefined);
});

test("createStore inside onCreate hook is allowed", () => {
  clearAllStores();
  createStore("parent", { value: 1 }, {
    onCreate: () => {
      createStore("child", { value: 2 });
    },
  });

  assert.strictEqual(hasStore("child"), true);
  assert.deepStrictEqual(getStore("child"), { value: 2 });
});

test("getStoreSnapshot reads staged values inside setStoreBatch", () => {
  clearAllStores();
  createStore("batched", { value: 0 });

  const pre = _getSnapshot("batched");
  assert.deepStrictEqual(pre, { value: 0 });

  let stagedSnapshot: any = null;
  setStoreBatch(() => {
    setStore("batched", "value", 1);
    stagedSnapshot = _getSnapshot("batched");
  });

  assert.deepStrictEqual(stagedSnapshot, { value: 1 });
});

test("configureStroid is registry-scoped", () => {
  const registryA = createStoreRegistry();
  const registryB = createStoreRegistry();
  const warningsA: string[] = [];
  const warningsB: string[] = [];

  runWithRegistry(registryA, () => {
    configureStroid({ logSink: { warn: (msg) => warningsA.push(msg) } });
    warn("A");
  });

  runWithRegistry(registryB, () => {
    configureStroid({ logSink: { warn: (msg) => warningsB.push(msg) } });
    warn("B");
  });

  runWithRegistry(registryA, () => {
    warn("A2");
  });

  assert.deepStrictEqual(warningsA, ["A", "A2"]);
  assert.deepStrictEqual(warningsB, ["B"]);

  resetConfig();
});

test("computed diamond dependencies recompute once per flush", async () => {
  clearAllStores();
  createStore("a", { value: 1 });
  createComputed("b", ["a"], (a) => ({ value: (a as any)?.value ?? 0 }));
  createComputed("c", ["a"], (a) => ({ value: (a as any)?.value ?? 0 }));
  createComputed("d", ["b", "c"], (b, c) => ({ sum: (b as any)?.value + (c as any)?.value }));

  let calls = 0;
  subscribe("d", () => { calls += 1; });

  setStore("a", "value", 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.strictEqual(calls, 1);
});

test("feature runtimes initialize before onStoreCreate in new registries", () => {
  const registry = createStoreRegistry();
  let created = 0;
  registerStoreFeature("testFeatureInit", () => ({
    onStoreCreate: () => {
      created += 1;
    },
  }));

  try {
    runWithRegistry(registry, () => {
      createStore("featureInitStore", { value: 1 });
    });
    assert.strictEqual(created, 1);
  } finally {
    resetRegisteredStoreFeaturesForTests();
  }
});

test("buildFlushPlan reuses the orderedNames buffer", () => {
  const registry = createStoreRegistry();
  registry.notify.pendingNotifications.add("alpha");
  registry.notify.pendingNotifications.add("beta");
  const plan = buildFlushPlan(registry.notify);
  assert.strictEqual(plan.names, registry.notify.orderedNames);
  assert.deepStrictEqual(plan.names, ["alpha", "beta"]);
});

test("snapshotStrategy sets the default snapshot mode", () => {
  clearAllStores();
  configureStroid({ snapshotStrategy: "shallow" });

  try {
    createStore("snap", { nested: { value: 1 } });
    const snap = _getSnapshot("snap") as any;
    const ref = _getStoreValueRef("snap") as any;
    assert.notStrictEqual(snap, ref);
    assert.strictEqual(snap.nested, ref.nested);
  } finally {
    resetConfig();
  }
});

test("default snapshot mode is deep", () => {
  clearAllStores();
  createStore("defaultSnap", { nested: { value: 1 } });
  const snap = _getSnapshot("defaultSnap") as any;
  const ref = _getStoreValueRef("defaultSnap") as any;
  assert.notStrictEqual(snap, ref);
  assert.notStrictEqual(snap.nested, ref.nested);
});

test("notify uses carrier values inside request registries", async () => {
  clearAllStores();
  const seen: Array<{ value: number } | null> = [];
  const ctx = createStoreForRequest((api) => {
    api.create("carrierStore", { value: 1 });
  });

  ctx.hydrate(() => {
    subscribe("carrierStore", (snap) => {
      seen.push((snap as { value: number } | null) ?? null);
    });
    setStore("carrierStore", "value", 2);
    return null;
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(seen.some((snap) => snap?.value === 2));
});

test("lazy store lifecycle helpers report pending vs materialized", () => {
  clearAllStores();
  createStore("lazyLife", () => ({ value: 1 }), { lazy: true });

  assert.strictEqual(isLazyStore("lazyLife"), true);
  assert.strictEqual(isStoreMaterialized("lazyLife"), false);
  assert.strictEqual(isLazyPending("lazyLife"), true);

  const pendingReset = resetStore("lazyLife");
  assert.deepStrictEqual(pendingReset, { ok: false, reason: "lazy-uninitialized" });

  const value = getStore("lazyLife");
  assert.deepStrictEqual(value, { value: 1 });
  assert.strictEqual(isStoreMaterialized("lazyLife"), true);
  assert.strictEqual(isLazyPending("lazyLife"), false);

  const resetResult = resetStore("lazyLife");
  assert.deepStrictEqual(resetResult, { ok: true });
});

test("lifecycle flush hooks fire once per store flush", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 5 } });

  const events: string[] = [];
  const stopBefore = registerHook("beforeFlush", (name) => {
    events.push(`before:${name}`);
  });
  const stopAfter = registerHook("afterFlush", (name) => {
    events.push(`after:${name}`);
  });

  try {
    createStore("hooked", { value: 0 });
    subscribe("hooked", () => {});
    setStore("hooked", "value", 1);
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.deepStrictEqual(events, ["before:hooked", "after:hooked"]);
  } finally {
    stopBefore();
    stopAfter();
    resetConfig();
  }
});

test("transaction state isolates concurrent async contexts on a shared registry", async () => {
  const txContext = new AsyncLocalStorage<ReturnType<typeof createTransactionState>>();
  injectTransactionRunner({
    run: (state, fn) => txContext.run(state, fn),
    get: () => txContext.getStore() || null,
    enterWith: (state) => txContext.enterWith(state),
  });

  const registry = createStoreRegistry();
  runWithRegistry(registry, () => {
    createStore("txShared", { value: 0 });
  });

  const results: Array<{ ctx: string; value: number }> = [];
  const runContext = (label: string, value: number, delay: number) =>
    new Promise<void>((resolve) => {
      txContext.run(createTransactionState(), () => {
        beginTransaction(registry);
        stageTransactionValue("txShared", { value });
        results.push({ ctx: label, value: (getStagedTransactionValue("txShared").value as any)?.value });
        setTimeout(() => {
          results.push({ ctx: label, value: (getStagedTransactionValue("txShared").value as any)?.value });
          endTransaction(undefined, registry);
          resolve();
        }, delay);
      });
    });

  await Promise.all([
    runContext("A", 1, 20),
    runContext("B", 2, 5),
  ]);

  const valuesByCtx = results.reduce<Record<string, number[]>>((acc, entry) => {
    if (!acc[entry.ctx]) acc[entry.ctx] = [];
    acc[entry.ctx].push(entry.value);
    return acc;
  }, {});

  assert.deepStrictEqual(valuesByCtx.A, [1, 1]);
  assert.deepStrictEqual(valuesByCtx.B, [2, 2]);

  const stressResults: Array<{ ctx: string; value: number }> = [];
  const stressTasks = Array.from({ length: 8 }, (_, index) =>
    runContext(`S${index}`, index + 10, (index % 3) * 4).then(() => {
      const entries = results.filter((entry) => entry.ctx === `S${index}`);
      entries.forEach((entry) => stressResults.push(entry));
    })
  );
  await Promise.all(stressTasks);
  stressResults.forEach((entry) => {
    assert.strictEqual(entry.value, Number(entry.ctx.slice(1)) + 10);
  });

  injectTransactionRunner(null);
});

test("mid-flush store deletion does not crash or notify deleted subscribers", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 10 } });

  try {
    createStore("chaos", { value: 0 });
    const events: Array<{ id: string; value: unknown }> = [];

    subscribe("chaos", (snap) => {
      events.push({ id: "first", value: snap });
      if (snap && (snap as any).value === 1) {
        deleteStore("chaos");
      }
    });
    subscribe("chaos", (snap) => {
      events.push({ id: "second", value: snap });
    });

    setStore("chaos", "value", 1);
    await new Promise((r) => setTimeout(r, 60));

    assert.ok(events.some((entry) => entry.id === "first" && (entry.value as any)?.value === 1));
    assert.ok(events.some((entry) => entry.value === null));
    assert.strictEqual(getStore("chaos"), null);
  } finally {
    resetConfig();
  }
});

test("chunked flush avoids mixed snapshots when store updates mid-chunk", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 10 } });

  try {
    createStore("chunkMix", { value: 0 });
    const calls: Array<[string, number]> = [];
    let triggered = false;

    subscribe("chunkMix", (snap: any) => {
      calls.push(["first", snap.value as number]);
      if (!triggered) {
        triggered = true;
        setStore("chunkMix", "value", (snap.value as number) + 1);
      }
    });
    subscribe("chunkMix", (snap: any) => {
      calls.push(["second", snap.value as number]);
    });

    setStore("chunkMix", "value", 1);
    await new Promise((r) => setTimeout(r, 80));

    const secondValues = calls.filter(([id]) => id === "second").map(([, value]) => value);
    assert.ok(secondValues.length > 0);
    assert.ok(secondValues.every((value) => value !== 1));
    assert.ok(secondValues.includes(2));
  } finally {
    resetConfig();
  }
});

test("notify uses computed order resolver when provided", async () => {
  clearAllStores();
  let calls = 0;
  const defaultResolver = getTopoOrderedComputeds;
  setComputedOrderResolver((names) => {
    calls += 1;
    return names;
  });

  try {
    createStore("orderHook", { value: 0 });
    setStore("orderHook", "value", 1);
    await Promise.resolve();
    assert.ok(calls > 0);
  } finally {
    setComputedOrderResolver(defaultResolver);
  }
});

test("mutatorProduce enables structural sharing", async () => {
  clearAllStores();
  const { produce } = await import("immer");
  configureStroid({ mutatorProduce: produce });

  try {
    createStore("sharing", { a: { value: 1 }, b: { value: 2 } });
    const before = _getStoreValueRef("sharing") as any;
    setStore("sharing", (draft: any) => {
      draft.a.value = 99;
    });
    const after = _getStoreValueRef("sharing") as any;
    assert.notStrictEqual(before, after);
    assert.notStrictEqual(before.a, after.a);
    assert.strictEqual(before.b, after.b);
  } finally {
    resetConfig();
  }
});

test("mutatorProduce accepts the \"immer\" alias after registration", async () => {
  clearAllStores();
  const { produce } = await import("immer");

  try {
    registerMutatorProduce(produce);
    configureStroid({ mutatorProduce: "immer" });
    createStore("sharingAlias", { a: { value: 1 }, b: { value: 2 } });
    const before = _getStoreValueRef("sharingAlias") as any;
    setStore("sharingAlias", (draft: any) => {
      draft.a.value = 2;
    });
    const after = _getStoreValueRef("sharingAlias") as any;
    assert.notStrictEqual(before, after);
    assert.notStrictEqual(before.a, after.a);
    assert.strictEqual(before.b, after.b);
  } finally {
    resetConfig();
  }
});

test("registerMutatorProduce locks and can be force-overridden", async () => {
  clearAllStores();
  const { produce } = await import("immer");
  const warnings: string[] = [];
  configureStroid({ logSink: { warn: (msg: string) => warnings.push(msg) } });

  const calls: string[] = [];
  const producerA = <T>(base: T, recipe: (draft: T) => void) => {
    calls.push("A");
    return produce(base, recipe);
  };
  const producerB = <T>(base: T, recipe: (draft: T) => void) => {
    calls.push("B");
    return produce(base, recipe);
  };

  try {
    registerMutatorProduce(producerA);
    registerMutatorProduce(producerB);
    registerMutatorProduce(producerB, { force: true });
    createStore("lockTest", { value: 1 });
    setStore("lockTest", (draft: any) => {
      draft.value = 2;
    });
  } finally {
    resetConfig();
  }

  assert.ok(warnings.some((msg) => msg.includes("registerMutatorProduce") && msg.includes("lock")));
  assert.ok(calls.includes("B"));
  assert.ok(!calls.includes("A"));
});

test("getStoreSnapshot caches within a transaction and invalidates on stage", () => {
  clearAllStores();
  createStore("batchCache", { value: 0 });

  let first: any = null;
  let second: any = null;
  let third: any = null;

  setStoreBatch(() => {
    setStore("batchCache", "value", 1);
    first = _getSnapshot("batchCache");
    second = _getSnapshot("batchCache");
    assert.strictEqual(first, second);

    setStore("batchCache", "value", 2);
    third = _getSnapshot("batchCache");
  });

  assert.deepStrictEqual(first, { value: 1 });
  assert.deepStrictEqual(third, { value: 2 });
  assert.notStrictEqual(first, third);
});

test("critical fires when sync payload is dropped", () => {
  const captured: string[] = [];
  configureStroid({
    logSink: {
      critical: (msg: string) => captured.push(msg),
    },
  });

  broadcastSync({
    name: "big",
    syncOption: { maxPayloadBytes: 10 },
    syncChannels: { big: { postMessage: () => { /* noop */ } } as any },
    syncClocks: { big: 1 },
    instanceId: "test",
    updatedAt: new Date().toISOString(),
    data: { huge: "x".repeat(1024) },
    hashState,
    reportStoreError: (_name, message) => captured.push(message),
  });

  assert.ok(captured.some((msg) => /payload/i.test(msg)));
  configureStroid({
    logSink: {
      warn: (msg: string) => { if (typeof console !== "undefined" && console.warn) console.warn(msg); },
      critical: (msg: string) => { if (typeof console !== "undefined" && console.error) console.error(msg); },
    },
  });
});

test("assertRuntime throws on warnings to hard-fail tests", () => {
  configureStroid({ assertRuntime: true });
  try {
    assert.throws(() => {
      createStore("", { value: 1 });
    }, /Store name must be a non-empty string/);
  } finally {
    resetConfig();
  }
});


