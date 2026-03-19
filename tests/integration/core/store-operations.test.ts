/**
 * @module tests/integration/core/store-operations
 *
 * LAYER: Integration
 * OWNS:  Store create/set/reset behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  createStoreStrict,
  setStore,
  setStoreBatch,
  resetStore,
  clearAllStores,
  getStore,
} from "../../../src/store.js";
import { configureStroid } from "../../../src/config.js";

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
