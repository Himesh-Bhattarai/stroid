import test from "node:test";
import assert from "node:assert";
import { configureStroid, resetConfig } from "../src/config.js";
import { clearAllStores } from "../src/runtime-admin.js";
import {
  createStore,
  getStore,
  hasStore,
  hydrateStores,
  setStore,
  setStoreBatch,
  subscribe,
  useRegistry,
  _getSnapshot,
} from "../src/store.js";
import { subscribeWithSelector } from "../src/selectors.js";
import { broadcastSync } from "../src/features/sync.js";
import { hashState } from "../src/utils.js";
import { defaultRegistryScope } from "../src/store-registry.js";
import { stores, validatePathSafety, getStoreAdmin } from "../src/store-lifecycle.js";
import { createStoreForRequest } from "../src/server.js";

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
