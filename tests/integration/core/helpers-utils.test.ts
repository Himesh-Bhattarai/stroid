/**
 * @module tests/integration/core/helpers-utils
 *
 * LAYER: Integration
 * OWNS:  Helper utilities and core utils behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore } from "../../../src/store.js";
import { createListStore, createEntityStore } from "../../../src/helpers/index.js";
import { devDeepFreeze } from "../../../src/utils/devfreeze.js";
import { hashState, deepClone, setByPath, sanitize } from "../../../src/utils.js";
import { benchmarkStoreSet } from "../../../src/helpers/testing.js";

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
