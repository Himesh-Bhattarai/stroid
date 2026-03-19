/**
 * @module tests/integration/core-runtime
 *
 * LAYER: Integration
 * OWNS:  Coverage expansion for selectors, runtime-tools, store-name, store-write,
 *        store-notify, and async request helpers.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  setStore,
  deleteStore,
  getStore,
  subscribeStore,
  _getStoreValueRef,
  setStoreBatch,
  replaceStore,
  resetStore,
  hydrateStores,
} from "../../src/store.js";
import { clearAllStores } from "../../src/runtime-admin/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { createSelector, subscribeWithSelector } from "../../src/selectors/index.js";
import { namespace } from "../../src/core/store-name.js";
import { createStoreCore, getActiveAsyncRegistry } from "../../src/core/store-core.js";
import { createStoreRegistry, runWithRegistry } from "../../src/core/store-registry.js";
import { notifyStore } from "../../src/core/store-shared/notify.js";
import {
  listStores,
  getStoreMeta,
  getInitialState,
  getMetrics,
  getSubscriberCount,
  getAsyncInflightCount,
  getPersistQueueDepth,
  getComputedGraph,
  getComputedDeps,
} from "../../src/runtime-tools/index.js";
import { fetchStore } from "../../src/async.js";
import { buildFetchOptions, parseResponseBody } from "../../src/async/request.js";
import { clearAllStores as clearAllStoresInternal } from "../../src/core/store-write.js";
import { getRegistry, initialStates } from "../../src/core/store-lifecycle/registry.js";
import { beginTransaction, endTransaction, isTransactionActive } from "../../src/core/store-transaction.js";
import {
  parsePath,
  validateDepth,
  getByPath,
  setByPath,
} from "../../src/utils/path.js";
import {
  shallowClone,
  deepClone,
  shallowEqual,
  produceClone,
} from "../../src/utils/clone.js";
import {
  runSchemaValidation,
  isValidData,
  canReuseSanitized,
  sanitize,
  isValidStoreName,
} from "../../src/utils/validation.js";
import { hashState, crc32 } from "../../src/utils/hash.js";
import { MIDDLEWARE_ABORT } from "../../src/features/lifecycle.js";
import { configureStroid, resetConfig } from "../../src/config.js";

test("createSelector caches primitive results and handles missing stores", () => {
  resetAllStoresForTest();
  createStore("sel", 1);

  const select = createSelector<number, number>("sel", (state) => state + 1);
  assert.strictEqual(select(), 2);
  assert.strictEqual(select(), 2);

  replaceStore("sel", 2);
  assert.strictEqual(select(), 3);

  deleteStore("sel");
  assert.strictEqual(select(), null);
});

test("subscribeWithSelector handles modes, late stores, and deletions", async () => {
  resetAllStoresForTest();

  const noop = subscribeWithSelector("missing", null as any, Object.is, null as any);
  assert.strictEqual(typeof noop, "function");
  noop();

  createStore("snapRef", { nested: { value: 1 } }, { snapshot: "ref" });
  let refInput: any = null;
  const refCalls: Array<[number, number]> = [];
  subscribeWithSelector(
    "snapRef",
    (state: any) => {
      refInput = state;
      return state.nested.value;
    },
    Object.is,
    (next, prev) => {
      refCalls.push([next as number, prev as number]);
    }
  );
  setStore("snapRef", "nested.value", 2);
  await Promise.resolve();

  const refRaw = _getStoreValueRef("snapRef");
  assert.strictEqual(refInput, refRaw);
  assert.deepStrictEqual(refCalls[0], [2, 1]);

  createStore("snapShallow", { nested: { value: 1 } }, { snapshot: "shallow" });
  let shallowInput: any = null;
  subscribeWithSelector(
    "snapShallow",
    (state: any) => {
      shallowInput = state;
      return state.nested;
    },
    Object.is,
    () => {}
  );
  setStore("snapShallow", "nested.value", 2);
  await Promise.resolve();

  const shallowRaw = _getStoreValueRef("snapShallow") as any;
  assert.notStrictEqual(shallowInput, shallowRaw);
  assert.strictEqual(shallowInput.nested, shallowRaw.nested);

  let lateCalls = 0;
  const latePairs: Array<[number, number | undefined]> = [];
  subscribeWithSelector(
    "lateStore",
    (state: any) => state.value as number,
    Object.is,
    (next, prev) => {
      lateCalls += 1;
      latePairs.push([next as number, prev as number]);
    }
  );
  createStore("lateStore", { value: 1 });
  setStore("lateStore", "value", 2);
  await Promise.resolve();

  assert.strictEqual(lateCalls, 1);
  assert.deepStrictEqual(latePairs[0], [2, undefined]);

  setStore("lateStore", "value", 3);
  await Promise.resolve();

  assert.strictEqual(lateCalls, 2);
  assert.deepStrictEqual(latePairs[1], [3, 2]);

  // Deletion should reset selector state without invoking listener.
  const deleteCalls: Array<[number, number | undefined]> = [];
  subscribeWithSelector(
    "toDelete",
    (state: any) => state.value as number,
    Object.is,
    (next, prev) => {
      deleteCalls.push([next as number, prev as number]);
    }
  );
  createStore("toDelete", { value: 1 });
  setStore("toDelete", "value", 2);
  await Promise.resolve();
  setStore("toDelete", "value", 3);
  await Promise.resolve();
  deleteStore("toDelete");
  await Promise.resolve();

  assert.deepStrictEqual(deleteCalls, [
    [2, undefined],
    [3, 2],
  ]);
});

test("runtime-tools report store metadata, patterns, and queue depth", async () => {
  resetAllStoresForTest();
  createStore("alpha", { value: 1 });
  createStore("beta", { value: 2 });

  const all = listStores();
  assert.ok(all.includes("alpha") && all.includes("beta"));

  const aOnly = listStores("a*");
  assert.deepStrictEqual(aOnly, ["alpha"]);

  assert.strictEqual(getStoreMeta("missing"), null);
  assert.deepStrictEqual(getInitialState().alpha, { value: 1 });

  let calls = 0;
  subscribeWithSelector("alpha", (state: any) => state.value, Object.is, () => { calls += 1; });
  setStore("alpha", "value", 2);
  await Promise.resolve();

  assert.ok(getMetrics("alpha"));
  assert.strictEqual(getSubscriberCount("alpha") > 0, true);
  assert.strictEqual(getSubscriberCount("missing"), 0);

  assert.strictEqual(getAsyncInflightCount("missing"), 0);
  assert.strictEqual(getAsyncInflightCount("alpha"), 0);

  // Persist queue depth stays at 0 without a scheduled save.
  assert.strictEqual(getPersistQueueDepth("missing"), 0);

  // Smoke-check computed graph helpers with no computed stores.
  const graph = getComputedGraph();
  assert.deepStrictEqual(graph.nodes, []);
  assert.deepStrictEqual(getComputedDeps("missing"), null);
});

test("store-core adapter scopes reads, writes, and subscriptions", async () => {
  resetAllStoresForTest();
  const registryA = createStoreRegistry();
  const registryB = createStoreRegistry();

  runWithRegistry(registryA, () => {
    createStore("coreStore", { value: 1 });
  });
  runWithRegistry(registryB, () => {
    createStore("coreStore", { value: 2 });
  });

  const coreA = createStoreCore<{ value: number }>("coreStore");
  const coreB = createStoreCore<{ value: number }>("coreStore");

  let seenA: any = null;
  let seenB: any = null;

  const unsubA = runWithRegistry(registryA, () =>
    coreA.subscribe((snap) => { seenA = snap; })
  );
  const unsubB = runWithRegistry(registryB, () =>
    coreB.subscribe((snap) => { seenB = snap; })
  );

  runWithRegistry(registryA, () => coreA.set("value", 10));
  runWithRegistry(registryB, () => coreB.set("value", 20));
  await Promise.resolve();

  assert.deepStrictEqual(runWithRegistry(registryA, () => coreA.get()), { value: 10 });
  assert.deepStrictEqual(runWithRegistry(registryB, () => coreB.get()), { value: 20 });
  assert.deepStrictEqual(seenA, { value: 10 });
  assert.deepStrictEqual(seenB, { value: 20 });

  unsubA();
  unsubB();
});

test("store-core async registry resolves per active registry", () => {
  resetAllStoresForTest();
  const registryA = createStoreRegistry();
  const registryB = createStoreRegistry();

  runWithRegistry(registryA, () => {
    assert.strictEqual(getActiveAsyncRegistry(), registryA.async);
  });
  runWithRegistry(registryB, () => {
    assert.strictEqual(getActiveAsyncRegistry(), registryB.async);
  });
});

test("store-shared notify handler bridges to store-notify", async () => {
  resetAllStoresForTest();
  createStore("notifyBridge", { value: 1 });
  let calls = 0;
  const unsubscribe = subscribeStore("notifyBridge", () => {
    calls += 1;
  });

  notifyStore("notifyBridge");
  const pending = getRegistry().notify.pendingNotifications.has("notifyBridge");
  await new Promise((resolve) => setTimeout(resolve, 0));

  unsubscribe();
  assert.ok(pending);
  assert.strictEqual(calls, 1);
});

test("runtime-tools persist queue depth reports pending saves", async () => {
  resetAllStoresForTest();
  await import("../../src/persist.js");

  const driver = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };

  createStore("persistDepth", { value: 1 }, {
    persist: {
      driver,
      key: "persist-depth",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  setStore("persistDepth", "value", 2);
  assert.strictEqual(getPersistQueueDepth("persistDepth"), 1);
  clearAllStores();
});

test("store-name namespace helpers qualify and route operations", () => {
  resetAllStoresForTest();
  const ns = namespace("app");

  const userKey = ns.store("user");
  assert.strictEqual(userKey.name, "app::user");
  const alreadyQualified = ns.store("app::config");
  assert.strictEqual(alreadyQualified.name, "app::config");

  ns.create("user", { name: "A" });
  ns.set("user", "name", "B");
  assert.deepStrictEqual(ns.get("user"), { name: "B" });

  ns.create("config", { enabled: true });
  ns.set(alreadyQualified, "enabled", false);
  assert.deepStrictEqual(ns.get("config"), { enabled: false });

  ns.reset("config");
  assert.deepStrictEqual(ns.get("config"), { enabled: true });

  ns.delete("user");
  assert.strictEqual(getStore("app::user"), null);
});

test("hydrateStores enforces trust validation branches", () => {
  resetAllStoresForTest();

  const untrusted = hydrateStores({ a: { value: 1 } }, {}, {} as any);
  assert.strictEqual(untrusted.blocked?.reason, "untrusted");

  const failed = hydrateStores(
    { b: { value: 2 } },
    {},
    { allowUntrusted: true, validate: () => false }
  );
  assert.strictEqual(failed.blocked?.reason, "validation-failed");

  assert.throws(() => {
    hydrateStores(
      { c: { value: 3 } },
      {},
      { allowUntrusted: true, validate: () => { throw new Error("boom"); } }
    );
  }, /trust\.validate threw/);

  const invalid = hydrateStores(
    { "bad name": { value: 1 } } as any,
    {},
    { allowUntrusted: true }
  );
  const invalidEntry = invalid.failed.find((entry) => entry.name === "bad name");
  assert.strictEqual(invalidEntry?.reason, "invalid-name");
});

test("setStoreBatch guards invalid callbacks and transaction errors", async () => {
  resetAllStoresForTest();

  setStoreBatch(null as any);
  setStoreBatch(async () => {});
  setStoreBatch(() => Promise.resolve());

  createStore("batchFail", { value: 1 });
  setStoreBatch(() => {
    replaceStore("batchFail", { value: 2 });
  });

  await Promise.resolve();
});

test("async request helpers cover fetch option branches", async () => {
  const controller = new AbortController();
  const opts = buildFetchOptions({
    method: "post",
    headers: { "X-Test": "1" },
    body: { ok: true },
    signal: controller.signal,
  });
  assert.strictEqual(opts.method, "POST");
  assert.deepStrictEqual(opts.headers, { "X-Test": "1" });
  assert.strictEqual(opts.body, JSON.stringify({ ok: true }));
  assert.strictEqual(opts.signal, controller.signal);

  const optsDefault = buildFetchOptions({ body: "raw" });
  assert.deepStrictEqual(optsDefault.headers, { "Content-Type": "application/json" });
  assert.strictEqual(optsDefault.body, "raw");

  const makeResponse = (contentType: string) => ({
    headers: { get: () => contentType },
    json: async () => ({ type: "json" }),
    text: async () => "text",
    arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    blob: async () => ({ kind: "blob" }),
    formData: async () => ({ kind: "form" }),
  }) as unknown as Response;

  assert.deepStrictEqual(await parseResponseBody(makeResponse("ignored"), "json"), { type: "json" });
  assert.strictEqual(await parseResponseBody(makeResponse("ignored"), "text"), "text");
  assert.strictEqual(
    (await parseResponseBody(makeResponse("ignored"), "arrayBuffer")) instanceof ArrayBuffer,
    true
  );
  assert.deepStrictEqual(await parseResponseBody(makeResponse("ignored"), "blob"), { kind: "blob" });
  assert.deepStrictEqual(await parseResponseBody(makeResponse("ignored"), "formData"), { kind: "form" });

  assert.deepStrictEqual(await parseResponseBody(makeResponse("application/json"), undefined), { type: "json" });
  assert.strictEqual(await parseResponseBody(makeResponse("text/plain"), undefined), "text");
  assert.deepStrictEqual(await parseResponseBody(makeResponse("multipart/form-data"), undefined), { kind: "form" });
  assert.strictEqual(
    (await parseResponseBody(makeResponse("application/octet-stream"), undefined)) instanceof ArrayBuffer,
    true
  );
});

test("async inflight count reports active requests", async () => {
  resetAllStoresForTest();
  createStore("asyncCount", {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });

  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  fetchStore("asyncCount", () => promise);
  assert.strictEqual(getAsyncInflightCount("asyncCount") > 0, true);

  resolve?.();
  await new Promise((r) => setTimeout(r, 0));
});

test("utils/path handles parsing, depth, and mutations", () => {
  resetAllStoresForTest();

  assert.deepStrictEqual(parsePath(["a", "b"]), ["a", "b"]);
  assert.deepStrictEqual(parsePath("plain"), ["plain"]);
  assert.deepStrictEqual(parsePath("a\\.b.c"), ["a.b", "c"]);
  assert.deepStrictEqual(parsePath(123 as any), ["123"]);

  assert.strictEqual(validateDepth(Array.from({ length: 11 }, () => "x")), false);
  assert.strictEqual(validateDepth(["a", "b", "c", "d", "e", "f"]), true);

  assert.strictEqual(getByPath(null, "a"), undefined);
  assert.strictEqual(getByPath(5 as any, "a"), undefined);
  assert.strictEqual(getByPath({ a: { b: 1 } }, "a.b"), 1);

  const base = { a: { b: 1 }, arr: [{ v: 1 }] };
  const updated = setByPath(base, "a.b", 2);
  assert.deepStrictEqual(updated, { a: { b: 2 }, arr: [{ v: 1 }] });

  const updatedArr = setByPath([{ v: 1 }], "0.v", 2);
  assert.deepStrictEqual(updatedArr, [{ v: 2 }]);

  const created = setByPath({}, "x.0.y", 3) as any;
  assert.deepStrictEqual(created, { x: [3] });

  const untouched = setByPath([1, 2], "x", 3);
  assert.deepStrictEqual(untouched, [1, 2]);

  const forbidden = setByPath({ safe: 1 } as any, "__proto__", 9);
  assert.strictEqual((forbidden as any).safe, 1);

  const forbiddenNested = setByPath({ safe: {} } as any, "safe.__proto__", 9);
  assert.deepStrictEqual(forbiddenNested, { safe: {} });

  const fallback = setByPath(5 as any, "a.b", 1);
  assert.strictEqual(fallback as any, 5);
});

test("utils/clone covers shallow and deep clone branches", () => {
  resetAllStoresForTest();

  const obj: Record<string, unknown> = { visible: 1 };
  Object.defineProperty(obj, "hidden", { value: 2, enumerable: false });
  Object.defineProperty(obj, "computed", { get: () => 3, enumerable: true });
  Object.defineProperty(obj, "constructor", { value: 4, enumerable: true });

  const shallow = shallowClone(obj);
  assert.deepStrictEqual(shallow, { visible: 1 });

  const withFn = { value: 1, fn: () => "x" };
  assert.throws(() => {
    deepClone(withFn);
  }, /structured-cloneable|function/i);

  const complex = {
    map: new Map([["a", { v: 1 }]]),
    set: new Set([1, 2]),
    arr: [1, { v: 2 }],
  };
  const complexClone = deepClone(complex) as any;
  assert.strictEqual(complexClone.map instanceof Map, true);
  assert.strictEqual(complexClone.set instanceof Set, true);
  assert.deepStrictEqual(complexClone.arr, [1, { v: 2 }]);

  if (typeof (globalThis as any).WeakRef === "function") {
    const weak = new (globalThis as any).WeakRef({ ok: true });
    assert.throws(() => {
      deepClone({ weak });
    }, /WeakRef|structured-cloneable/i);
  }

  const proxy = new Proxy({}, {
    getOwnPropertyDescriptor() {
      throw new Error("descriptor boom");
    },
    ownKeys() {
      return [];
    },
  });
  let proxyError: unknown = null;
  try {
    deepClone(proxy as any);
  } catch (err) {
    proxyError = err;
  }
  if (proxyError) {
    assert.match(String(proxyError), /object descriptors|Proxy|host object/i);
  }

  assert.strictEqual(shallowEqual({ a: 1 }, { a: 1 }), true);
  assert.strictEqual(shallowEqual({ a: 1 }, { a: 2 }), false);
  assert.strictEqual(shallowEqual(null, { a: 1 }), false);

  assert.throws(() => {
    produceClone({ value: 1 }, () => {
      throw new Error("boom");
    });
  }, /produceClone failed/);
});

test("deepClone warns and falls back when structuredClone fails", () => {
  resetAllStoresForTest();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });
  const originalClone = (globalThis as any).structuredClone;
  try {
    (globalThis as any).structuredClone = () => {
      throw new Error("structuredClone boom");
    };
    const value = { nested: { value: 1 } };
    const cloned = deepClone(value);
    assert.notStrictEqual(cloned, value);
    assert.ok(warnings.some((msg) => msg.includes("fell back to manual clone")));
  } finally {
    (globalThis as any).structuredClone = originalClone;
    resetConfig();
  }
});

test("store-write reset/delete branches for lazy stores and batching", async () => {
  resetAllStoresForTest();

  createStore("lazyReset", () => ({ value: 1 }), { lazy: true });
  const resetResult = resetStore("lazyReset");
  assert.deepStrictEqual(resetResult, { ok: false, reason: "lazy-uninitialized" });
  assert.deepStrictEqual(getStore("lazyReset"), { value: 1 });
  assert.deepStrictEqual(resetStore("lazyReset"), { ok: true });

  createStore("toDeleteBatch", { value: 1 });
  setStoreBatch(() => {
    deleteStore("toDeleteBatch");
  });

  createStore("insideBatch", { value: 1 });
  setStoreBatch(() => {
    clearAllStoresInternal();
  });

  let hydrateResult: any = null;
  setStoreBatch(() => {
    hydrateResult = hydrateStores({ hydrated: { value: 1 } } as any, {}, { allowUntrusted: true });
  });
  assert.strictEqual(hydrateResult?.blocked?.reason, "transaction");

  createStore("missingInit", { value: 1 });
  delete (initialStates as Record<string, unknown>)["missingInit"];
  const resetMissing = resetStore("missingInit");
  assert.strictEqual(resetMissing.ok, false);
});

test("store-write guards fire inside manual transaction", () => {
  resetAllStoresForTest();
  createStore("txGuard", { value: 1 });

  beginTransaction();
  try {
    assert.strictEqual(isTransactionActive(), true);
    deleteStore("txGuard");
    clearAllStoresInternal();
    const hydrateResult = hydrateStores({ txHydrate: { value: 1 } } as any, {}, { allowUntrusted: true });
    assert.strictEqual(hydrateResult.blocked?.reason, "transaction");
  } finally {
    endTransaction();
  }

  // Guarded calls should not have cleared/deleted the store.
  assert.deepStrictEqual(getStore("txGuard"), { value: 1 });
});

test("store-write middleware, validation, and replace branches", () => {
  resetAllStoresForTest();

  createStore("mwAbort", { value: 1 }, {
    lifecycle: {
      middleware: [
        () => {
          throw new Error("stop");
        },
      ],
    },
  });

  setStoreBatch(() => {
    const result = setStore("mwAbort", { value: 2 });
    assert.strictEqual(result.ok, false);
  });

  createStore("validateFail", { value: 1 }, {
    validate: (next: any) => (next?.value === 1 ? true : false),
  });
  setStoreBatch(() => {
    const result = setStore("validateFail", { value: 2 });
    assert.strictEqual(result.ok, false);
  });

  createStore("replaceMw", { value: 1 }, {
    lifecycle: {
      middleware: [() => MIDDLEWARE_ABORT as any],
    },
  });
  const replaceMw = replaceStore("replaceMw", { value: 2 });
  assert.deepStrictEqual(replaceMw, { ok: false, reason: "middleware" });

  const replaceMissing = replaceStore("missingReplace", { value: 1 } as any);
  assert.deepStrictEqual(replaceMissing, { ok: false, reason: "not-found" });

  const replaceInvalid = replaceStore("replaceMw", undefined as any);
  assert.deepStrictEqual(replaceInvalid, { ok: false, reason: "validate" });
});

test("resetStore reports missing initial state branch", () => {
  resetAllStoresForTest();
  createStore("missingInitBranch", { value: 1 });
  delete (initialStates as Record<string, unknown>)["missingInitBranch"];

  const result = resetStore("missingInitBranch");
  assert.strictEqual(result.ok, false);
});

test("hashState covers numeric and structural branches", () => {
  const holey = [1, , 3];
  const date = new Date(0);
  const map = new Map([
    ["a", 1],
    ["b", { nested: true }],
  ]);
  const set = new Set([1, 2, 3]);
  const sym = Symbol.for("hash-test");
  function namedFn() {
    return 1;
  }

  const value = {
    nan: Number.NaN,
    inf: Number.POSITIVE_INFINITY,
    negInf: Number.NEGATIVE_INFINITY,
    negZero: -0,
    int: 42,
    float: 3.14,
    bool: true,
    undef: undefined,
    big: BigInt(9),
    sym,
    fn: namedFn,
    arr: holey,
    date,
    map,
    set,
    obj: { ok: true },
  };

  const hash = hashState(value);
  assert.strictEqual(typeof hash, "number");
  assert.strictEqual(hashState("string"), crc32(JSON.stringify("string")));
});

test("utils/validation covers schema, sanitize, and name helpers", () => {
  resetAllStoresForTest();

  const safeSchema = {
    safeParse: (value: unknown) => ({ success: true, data: { value } }),
  };
  const safeFail = {
    safeParse: () => ({ success: false, error: "bad" }),
  };
  assert.deepStrictEqual(runSchemaValidation(safeSchema, 1), { ok: true, data: { value: 1 } });
  assert.deepStrictEqual(runSchemaValidation(safeFail, 1), { ok: false, error: "bad" });

  const parseSchema = {
    parse: (value: unknown) => {
      if (value !== "ok") throw new Error("nope");
    },
  };
  assert.deepStrictEqual(runSchemaValidation(parseSchema, "ok"), { ok: true, data: "ok" });

  const validateSyncSchema = {
    validateSync: (value: unknown) => {
      if (value !== 2) throw new Error("nope");
    },
  };
  assert.deepStrictEqual(runSchemaValidation(validateSyncSchema, 2), { ok: true, data: 2 });

  const isValidSyncSchema = {
    isValidSync: (value: unknown) => value === 3,
  };
  assert.deepStrictEqual(runSchemaValidation(isValidSyncSchema, 1), { ok: false, error: "Schema validation failed" });

  const validateSchema = {
    validate: (value: unknown) => (value === 4 ? true : false),
    errors: "failed",
  };
  assert.deepStrictEqual(runSchemaValidation(validateSchema, 4), { ok: true, data: 4 });
  assert.deepStrictEqual(runSchemaValidation(validateSchema, 1), { ok: false, error: "failed" });

  const validateSchemaObj = {
    validate: () => ({ error: { message: "bad" } }),
  };
  assert.deepStrictEqual(runSchemaValidation(validateSchemaObj, 1), { ok: false, error: "bad" });

  const fnSchema = (value: unknown) => (value === "x" ? { ok: true } : false);
  assert.deepStrictEqual(runSchemaValidation(fnSchema, "x"), { ok: true, data: { ok: true } });
  assert.deepStrictEqual(runSchemaValidation(fnSchema, "y"), { ok: false, error: "Schema validation failed" });

  assert.strictEqual(isValidData(() => {}), false);
  assert.strictEqual(isValidData(new Map()), true);
  assert.strictEqual(isValidData(new Set()), true);
  assert.strictEqual(isValidData(new Date()), true);

  assert.strictEqual(canReuseSanitized({ a: 1, b: [1, 2] }), true);
  assert.strictEqual(canReuseSanitized({ when: new Date() }), false);

  const arrayWithKey: any[] = [];
  arrayWithKey.extra = 1;
  assert.strictEqual(canReuseSanitized(arrayWithKey), false);

  const withSymbol: any = { a: 1 };
  withSymbol[Symbol("x")] = 2;
  assert.strictEqual(canReuseSanitized(withSymbol), false);

  assert.throws(() => {
    const withAccessor: any = {};
    Object.defineProperty(withAccessor, "x", {
      get: () => 1,
      enumerable: true,
    });
    canReuseSanitized(withAccessor);
  }, /Accessor/);

  assert.throws(() => {
    const circular: any = {};
    circular.self = circular;
    canReuseSanitized(circular);
  }, /Circular/);

  assert.throws(() => {
    canReuseSanitized(Infinity);
  }, /Non-finite/);

  assert.deepStrictEqual(sanitize({ a: 1, b: { c: 2 } }), { a: 1, b: { c: 2 } });
  assert.strictEqual(typeof sanitize(new Date("2020-01-01T00:00:00.000Z")), "string");
  assert.deepStrictEqual(sanitize(new Map([["k", 1]])), { k: 1 });
  assert.deepStrictEqual(sanitize(new Set([1, 2])), [1, 2]);

  assert.throws(() => {
    sanitize(Symbol("x"));
  }, /Symbol/);

  assert.strictEqual(isValidStoreName("ok"), true);
  assert.strictEqual(isValidStoreName("bad name"), false);
  assert.strictEqual(isValidStoreName("__proto__"), false);
  assert.strictEqual(isValidStoreName(""), false);
});

test("computed guards invalid arguments and missing entries", async () => {
  resetAllStoresForTest();
  const { createComputed, invalidateComputed, deleteComputed } = await import("../../src/computed/index.js");

  assert.strictEqual(createComputed("", ["a"], () => 1), undefined);
  assert.strictEqual(createComputed("badDeps", [] as any, () => 1), undefined);
  assert.strictEqual(createComputed("badCompute", ["a"], null as any), undefined);
  assert.strictEqual(createComputed("badDepType", [123 as any], () => 1), undefined);

  invalidateComputed("missingComputed");
  deleteComputed("missingComputed");
});
