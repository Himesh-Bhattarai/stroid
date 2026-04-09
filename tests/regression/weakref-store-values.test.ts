/**
 * @module tests/regression/weakref-store-values
 *
 * LAYER: Regression
 * OWNS:  WeakRef rejection across sanitize/clone/create/hydrate boundaries.
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
} from "../../src/store.js";
import { deepClone, sanitize } from "../../src/utils.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const hasWeakRef = typeof WeakRef === "function";

test("sanitize/deepClone reject WeakRef payloads even after target GC", { skip: !hasWeakRef }, () => {
  let target: { alive: boolean } | null = { alive: true };
  const weak = new WeakRef(target);
  target = null;
  (globalThis as { gc?: () => void }).gc?.();

  assert.throws(() => {
    sanitize({ value: weak });
  }, /WeakRef values are not supported/i);
  assert.throws(() => {
    deepClone({ value: weak });
  }, /WeakRef|structured-cloneable/i);
});

test("createStore/hydrateStores reject WeakRef values without recreating stores", { skip: !hasWeakRef }, () => {
  resetAllStoresForTest();

  const errors: string[] = [];
  const weak = new WeakRef({ value: 1 });

  const created = createStore("weakRefCreate", { payload: weak } as unknown, {
    onError: (message) => {
      errors.push(message);
    },
  });
  assert.strictEqual(created, undefined);
  assert.strictEqual(hasStore("weakRefCreate"), false);

  const hydrate = hydrateStores(
    { weakRefHydrate: { payload: weak } } as Record<string, unknown>,
    {},
    { allowTrusted: true }
  );

  assert.ok(
    hydrate.failed.some(
      (entry) => entry.name === "weakRefHydrate" && entry.reason === "create-failed"
    )
  );
  assert.strictEqual(hasStore("weakRefHydrate"), false);
  assert.strictEqual(getStore("weakRefHydrate"), null);
  assert.ok(errors.some((message) => message.includes("WeakRef values are not supported")));
});
