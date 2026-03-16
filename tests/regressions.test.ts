/**
 * @module tests/regressions.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/regressions.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { configureStroid, resetConfig } from "../src/config.js";
import { clearAllStores } from "../src/runtime-admin.js";
import {
  createStore,
  deleteStore,
  getStore,
  hasStore,
  hydrateStores,
  replaceStore,
  setStore,
  setStoreBatch,
  subscribe,
  useRegistry,
  _getSnapshot,
  _getStoreValueRef,
} from "../src/store.js";
import { subscribeWithSelector } from "../src/selectors.js";
import { broadcastSync } from "../src/features/sync.js";
import { hashState, warn } from "../src/utils.js";
import { createStoreRegistry, defaultRegistryScope, runWithRegistry } from "../src/store-registry.js";
import { stores, validatePathSafety, pathValidationCache, getStoreAdmin } from "../src/store-lifecycle.js";
import { createStoreForRequest } from "../src/server.js";
import { setComputedOrderResolver } from "../src/internals/computed-order.js";
import { getTopoOrderedComputeds } from "../src/computed-graph.js";
import { createComputed } from "../src/computed.js";
import { registerStoreFeature, resetRegisteredStoreFeaturesForTests } from "../src/feature-registry.js";

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

test("replaceStore inside batch reports critical and keeps state", () => {
  clearAllStores();
  createStore("batchReplace", { value: 1 });
  const messages: string[] = [];
  configureStroid({
    logSink: {
      critical: (msg: string) => messages.push(msg),
    },
  });

  try {
    let result: any;
    setStoreBatch(() => {
      result = replaceStore("batchReplace", { value: 2 });
    });

    assert.strictEqual(result?.ok, false);
    assert.deepStrictEqual(getStore("batchReplace"), { value: 1 });
    assert.ok(messages.some((msg) => msg.includes("replaceStore") && msg.includes("setStoreBatch")));
  } finally {
    resetConfig();
  }
});

test("setStoreBatch warns on promise-returning callbacks", async () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  try {
    setStoreBatch(() => Promise.resolve());
    await Promise.resolve();
    assert.ok(warnings.some((msg) => msg.includes("promise-returning")));
  } finally {
    resetConfig();
  }
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

test("bindRegistry preserves lazy factories across scope switches", () => {
  const scopeA = "test-scope-a";
  const scopeB = "test-scope-b";

  useRegistry(scopeA);
  clearAllStores();

  let calls = 0;
  createStore("lazy", () => {
    calls += 1;
    return { count: 1 };
  }, { lazy: true });

  useRegistry(scopeB);
  clearAllStores();
  createStore("other", { ok: true });

  useRegistry(scopeA);
  assert.deepStrictEqual(getStore("lazy"), { count: 1 });
  assert.strictEqual(calls, 1);

  useRegistry(defaultRegistryScope);
});

test("runtime-admin clearAllStores clears the current registry scope", () => {
  const scope = "test-admin-scope";
  useRegistry(scope);
  clearAllStores();

  createStore("scoped", { value: 1 });
  assert.strictEqual(hasStore("scoped"), true);

  clearAllStores();
  assert.strictEqual(hasStore("scoped"), false);

  useRegistry(defaultRegistryScope);
});

test("getStoreAdmin returns per-registry admin instances", () => {
  useRegistry("admin-scope-a");
  const adminA = getStoreAdmin();

  useRegistry("admin-scope-b");
  const adminB = getStoreAdmin();

  assert.notStrictEqual(adminA, adminB);

  useRegistry(defaultRegistryScope);
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
  assert.strictEqual(result.failed.defined, "undefined");
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

test("mutatorProduce accepts the \"immer\" alias when globally provided", async () => {
  clearAllStores();
  const { produce } = await import("immer");
  (globalThis as any).__STROID_IMMER_PRODUCE__ = produce;

  try {
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
    delete (globalThis as any).__STROID_IMMER_PRODUCE__;
    resetConfig();
  }
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


