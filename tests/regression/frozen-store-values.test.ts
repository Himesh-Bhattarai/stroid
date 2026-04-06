/**
 * @module tests/regression/frozen-store-values
 *
 * LAYER: Regression
 * OWNS:  Frozen payload hardening across createStore/setStore and snapshot modes.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  getStore,
  getStoreSnapshot,
  setStore,
  _getStoreValueRef,
} from "../../src/store.js";
import { devDeepFreeze } from "../../src/utils/devfreeze.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

type FrozenState = {
  nested: { value: number };
  flag: boolean;
};

test("createStore/setStore accept frozen payloads without mutating caller-owned objects", () => {
  resetAllStoresForTest();

  const initial = Object.freeze({
    nested: Object.freeze({ value: 1 }),
    flag: true,
  });
  createStore("frozenDeep", initial, { snapshot: "deep" });

  const committedAfterCreate = _getStoreValueRef("frozenDeep") as FrozenState | null;
  assert.ok(committedAfterCreate !== null && typeof committedAfterCreate === "object");
  assert.notStrictEqual(committedAfterCreate, initial);
  assert.strictEqual(Object.isFrozen(committedAfterCreate), false);

  const update = Object.freeze({
    nested: Object.freeze({ value: 2 }),
  });
  const result = setStore("frozenDeep", update);
  assert.deepStrictEqual(result, { ok: true });

  const committedAfterSet = _getStoreValueRef("frozenDeep") as FrozenState | null;
  assert.ok(committedAfterSet !== null && typeof committedAfterSet === "object");
  assert.strictEqual(committedAfterSet?.nested.value, 2);
  assert.strictEqual(committedAfterSet?.flag, true);
  assert.notStrictEqual(committedAfterSet, update);

  assert.deepStrictEqual(initial, { nested: { value: 1 }, flag: true });
  assert.deepStrictEqual(update, { nested: { value: 2 } });

  const snapshot = getStore("frozenDeep") as FrozenState | null;
  assert.deepStrictEqual(snapshot, { nested: { value: 2 }, flag: true });
  assert.ok(snapshot !== null && typeof snapshot === "object");
  assert.strictEqual(Object.isFrozen(snapshot), false);
});

test("ref snapshot mode tolerates frozen inputs and emits stable frozen snapshots in dev", () => {
  resetAllStoresForTest();

  const initial = Object.freeze({ value: 1 });
  createStore("frozenRef", initial, { snapshot: "ref" });

  const committed = _getStoreValueRef("frozenRef") as { value: number } | null;
  assert.ok(committed && typeof committed === "object");
  assert.notStrictEqual(committed, initial);

  const firstSnapshot = getStoreSnapshot("frozenRef") as { value: number } | null;
  assert.deepStrictEqual(firstSnapshot, { value: 1 });
  assert.ok(firstSnapshot && Object.isFrozen(firstSnapshot));

  const nextInput = Object.freeze({ value: 2 });
  const write = setStore("frozenRef", nextInput);
  assert.deepStrictEqual(write, { ok: true });
  assert.deepStrictEqual(nextInput, { value: 2 });

  const secondSnapshot = getStoreSnapshot("frozenRef") as { value: number } | null;
  assert.deepStrictEqual(secondSnapshot, { value: 2 });
  assert.ok(secondSnapshot && Object.isFrozen(secondSnapshot));
});

test("devDeepFreeze is safe on already-frozen graphs", () => {
  const value = Object.freeze({
    nested: Object.freeze({ count: 1 }),
  });

  assert.doesNotThrow(() => {
    devDeepFreeze(value);
  });
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.nested));
});
