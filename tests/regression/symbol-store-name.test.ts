/**
 * @module tests/regression/symbol-store-name
 *
 * LAYER: Regression
 * OWNS:  Runtime guardrails when Symbol values are forced into store-name APIs.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  createStoreStrict,
  getStore,
  hasStore,
} from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("createStore rejects symbol store names forced through type casts", () => {
  resetAllStoresForTest();

  const errors: string[] = [];
  const symbolName = Symbol("store-name");

  const created = createStore(symbolName as unknown as string, { value: 1 }, {
    onError: (message) => {
      errors.push(message);
    },
  });

  assert.strictEqual(created, undefined);
  assert.strictEqual(hasStore(symbolName as unknown as string), false);
  assert.strictEqual(getStore(symbolName as unknown as string), null);
  assert.strictEqual(hasStore(String(symbolName)), false);
  assert.ok(errors.some((message) => message.includes("not a valid store name")));
});

test("createStoreStrict surfaces symbol-name misuse as a hard failure", () => {
  resetAllStoresForTest();

  const symbolName = Symbol("strict-store-name");
  assert.throws(() => {
    createStoreStrict(symbolName as unknown as string, { value: 1 });
  }, /createStoreStrict|valid store name/i);
  assert.strictEqual(hasStore(symbolName as unknown as string), false);
});
