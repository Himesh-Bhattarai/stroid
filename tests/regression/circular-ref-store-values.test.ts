/**
 * @module tests/regression/circular-ref-store-values
 *
 * LAYER: Regression
 * OWNS:  Circular-reference hardening at clone/hash/sanitize and store boundaries.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  getStore,
  hasStore,
  hydrateStores,
  setStore,
} from "../../src/store.js";
import { deepClone, hashState, sanitize } from "../../src/utils.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

type CircularNode = {
  value: number;
  nested?: { count: number };
  self?: CircularNode;
};

test("deepClone preserves circular topology and detaches nested references", () => {
  const source: CircularNode = {
    value: 1,
    nested: { count: 1 },
  };
  source.self = source;

  const copy = deepClone(source);
  assert.notStrictEqual(copy, source);
  assert.strictEqual(copy.self, copy);
  assert.notStrictEqual(copy.nested, source.nested);

  if (copy.nested) copy.nested.count = 2;
  assert.strictEqual(source.nested?.count, 1);
});

test("hashState is stable for equivalent circular objects and changes when payload changes", () => {
  const a: CircularNode = { value: 1 };
  const b: CircularNode = { value: 1 };
  const c: CircularNode = { value: 2 };
  a.self = a;
  b.self = b;
  c.self = c;

  const hashA = hashState(a);
  const hashB = hashState(b);
  const hashC = hashState(c);

  assert.strictEqual(hashA, hashB);
  assert.notStrictEqual(hashA, hashC);
});

test("sanitize/store/hydrate reject circular values without corrupting runtime state", () => {
  resetAllStoresForTest();

  const circular: CircularNode = { value: 1 };
  circular.self = circular;

  assert.throws(() => sanitize(circular), /circular reference/i);

  createStore("circularWritable", { value: 0 });
  const setResult = setStore("circularWritable", { loop: circular } as unknown);
  assert.strictEqual(setResult.ok, false);
  if (!setResult.ok) {
    assert.strictEqual(setResult.reason, "validate");
  }
  assert.deepStrictEqual(getStore("circularWritable"), { value: 0 });

  const hydrateResult = hydrateStores(
    { circularHydrate: circular } as Record<string, unknown>,
    {},
    { allowTrusted: true }
  );
  assert.deepStrictEqual(hydrateResult.created, []);
  assert.ok(
    hydrateResult.failed.some(
      (entry) => entry.name === "circularHydrate" && entry.reason === "create-failed"
    )
  );
  assert.strictEqual(hasStore("circularHydrate"), false);
  assert.strictEqual(getStore("circularHydrate"), null);
});
