/**
 * @module tests/async-revalidate-cleanup.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/async-revalidate-cleanup.test.
 *
 * Consumers: Test runner.
 */
import assert from "node:assert";
import { test } from "node:test";
import { enableRevalidateOnFocus, _resetAsyncStateForTests } from "../../src/async.js";
import { createStore, deleteStore, clearAllStores } from "../../src/store.js";

test("enableRevalidateOnFocus removes listeners when store is deleted", () => {
  clearAllStores();

  type Listener = (...args: unknown[]) => void;
  const addCalls: Array<{ type: string; handler: Listener }> = [];
  const removeCalls: typeof addCalls = [];

  // Minimal window shim
  const win: { addEventListener: (type: string, handler: Listener) => void; removeEventListener: (type: string, handler: Listener) => void } = {
    addEventListener: (type: string, handler: Listener) => addCalls.push({ type, handler }),
    removeEventListener: (type: string, handler: Listener) => removeCalls.push({ type, handler }),
  };

  // @ts-ignore
  const originalWindow = globalThis.window;
  // @ts-ignore
  globalThis.window = win;

  createStore("focus", { value: 1 });
  enableRevalidateOnFocus("focus");

  deleteStore("focus"); // should trigger cleanup subscriber

  // Restore window
  // @ts-ignore
  globalThis.window = originalWindow;

  assert.strictEqual(addCalls.length, 2);
  assert.strictEqual(removeCalls.length, 2);
  assert.deepStrictEqual(
    removeCalls.map((c) => c.type).sort(),
    ["focus", "online"]
  );

  clearAllStores();
});

test("resetAsyncState cleans up wildcard revalidate listeners", () => {
  clearAllStores();

  type Listener = (...args: unknown[]) => void;
  const addCalls: Array<{ type: string; handler: Listener }> = [];
  const removeCalls: typeof addCalls = [];

  const win: { addEventListener: (type: string, handler: Listener) => void; removeEventListener: (type: string, handler: Listener) => void } = {
    addEventListener: (type: string, handler: Listener) => addCalls.push({ type, handler }),
    removeEventListener: (type: string, handler: Listener) => removeCalls.push({ type, handler }),
  };

  // @ts-ignore
  const originalWindow = globalThis.window;
  // @ts-ignore
  globalThis.window = win;

  enableRevalidateOnFocus("*");
  _resetAsyncStateForTests();

  // @ts-ignore
  globalThis.window = originalWindow;

  assert.strictEqual(addCalls.length, 2);
  assert.strictEqual(removeCalls.length, 2);
  assert.deepStrictEqual(
    removeCalls.map((c) => c.type).sort(),
    ["focus", "online"]
  );
});

