/**
 * @module tests/integration/structural-sharing
 *
 * LAYER: Integration
 * OWNS:  Structural sharing updates with large store payloads.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { produce } from "immer";
import { _getStoreValueRef, createStore, getStore, setStore } from "../../src/store.js";
import { configureStroid, registerMutatorProduce, resetConfig } from "../../src/config.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("large store mutator updates preserve structural sharing", () => {
  resetAllStoresForTest();
  registerMutatorProduce(produce);
  configureStroid({ mutatorProduce: "immer" });

  try {
    const large = {
      list: Array.from({ length: 10_000 }, (_, i) => ({ id: i, value: i })),
      meta: { version: 1, owner: "test" },
    };

    createStore("largeShare", large, { snapshot: "ref" });
    const before = getStore("largeShare") as typeof large;

    setStore("largeShare", (draft: typeof large) => {
      draft.list[0].value = 999;
    });

    const after = getStore("largeShare") as typeof large;

    assert.notStrictEqual(after, before);
    assert.strictEqual(after.meta, before.meta);
    assert.strictEqual(before.list[0].value, 0);
    assert.strictEqual(after.list[0].value, 999);
  } finally {
    resetConfig();
  }
});

const now = (): number =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

test("large store path updates preserve structural sharing without mutatorProduce", () => {
  resetAllStoresForTest();
  resetConfig();

  const large = {
    list: Array.from({ length: 10_000 }, (_, i) => ({ id: i, value: i })),
    meta: { version: 1, owner: "test" },
    flags: { enabled: true },
  };

  createStore("largeShareNoImmer", large, { snapshot: "ref" });
  const before = _getStoreValueRef("largeShareNoImmer") as typeof large;

  const start = now();
  setStore("largeShareNoImmer", "list.4321.value", 123_456);
  const elapsed = now() - start;

  const after = _getStoreValueRef("largeShareNoImmer") as typeof large;

  assert.notStrictEqual(after, before);
  assert.notStrictEqual(after.list, before.list);
  assert.strictEqual(after.meta, before.meta);
  assert.strictEqual(after.flags, before.flags);
  assert.strictEqual(after.list[0], before.list[0]);
  assert.notStrictEqual(after.list[4321], before.list[4321]);
  assert.strictEqual(before.list[4321].value, 4321);
  assert.strictEqual(after.list[4321].value, 123_456);
  assert.ok(elapsed < 200, `expected large path update < 200ms, got ${elapsed.toFixed(2)}ms`);
});
