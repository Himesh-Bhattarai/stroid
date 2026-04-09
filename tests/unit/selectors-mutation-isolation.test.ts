/**
 * @module tests/selectors-mutation-isolation
 *
 * LAYER: Tests
 * OWNS:  Regression coverage for subscribeWithSelector snapshot isolation.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, setStore } from "../../src/store.js";
import { subscribeWithSelector } from "../../src/selectors/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("subscribeWithSelector does not leak selector mutations to other selector subscribers", async () => {
  resetAllStoresForTest();

  createStore("selIsolation", { list: [] as number[] }, { snapshot: "deep" });

  const pureSeen: number[] = [];
  const mutateSeen: number[] = [];

  // Register the mutating selector first so it runs first during flush delivery.
  const offMutate = subscribeWithSelector(
    "selIsolation",
    (state) => {
      state.list.push(1);
      return state.list.length;
    },
    () => false,
    (next) => {
      mutateSeen.push(next);
    }
  );

  const offPure = subscribeWithSelector(
    "selIsolation",
    (state) => state.list.length,
    () => false,
    (next) => {
      pureSeen.push(next);
    }
  );

  setStore("selIsolation", "list", []);
  await new Promise((resolve) => setTimeout(resolve, 0));

  offMutate();
  offPure();

  assert.deepStrictEqual(mutateSeen, [1]);
  assert.deepStrictEqual(pureSeen, [0]);
});

