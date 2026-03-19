/**
 * @module tests/regression/shallow-equal
 *
 * LAYER: Tests
 * OWNS:  Shallow-equality short-circuit for no-op updates.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { clearAllStores, createStore, setStore, subscribeStore } from "../../src/store.js";

const tick = async () => new Promise((resolve) => setTimeout(resolve, 0));

test("shallowEqual short-circuits notifications for identical object updates", async () => {
  clearAllStores();
  createStore("noopStore", { a: 1, b: 2 });
  let calls = 0;
  const off = subscribeStore("noopStore", () => {
    calls += 1;
  });

  setStore("noopStore", { a: 1, b: 2 });
  await tick();
  off();

  assert.strictEqual(calls, 0);
});

