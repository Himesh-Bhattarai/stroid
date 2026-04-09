/**
 * @module tests/regression/delete-hook-error-isolation
 *
 * LAYER: Regression
 * OWNS:  Delete flow must remain reliable when feature delete hooks throw.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerStoreFeature } from "../../src/feature.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { createStore, deleteStore, hasStore } from "../../src/store.js";

const THROWING_DELETE_FEATURE = "regression.throwing-delete-feature";

test("deleteStore continues cleanup when feature delete hooks throw", () => {
  resetAllStoresForTest();

  let beforeCalls = 0;
  let afterCalls = 0;

  registerStoreFeature(THROWING_DELETE_FEATURE, () => ({
    beforeStoreDelete() {
      beforeCalls += 1;
      throw new Error("before delete boom");
    },
    afterStoreDelete() {
      afterCalls += 1;
      throw new Error("after delete boom");
    },
  }));

  createStore(
    "delete.throwing-hook",
    { value: 1 },
    { features: { [THROWING_DELETE_FEATURE]: true } },
  );

  assert.strictEqual(hasStore("delete.throwing-hook"), true);

  assert.doesNotThrow(() => {
    deleteStore("delete.throwing-hook");
  });

  assert.strictEqual(beforeCalls, 1);
  assert.strictEqual(afterCalls, 1);
  assert.strictEqual(hasStore("delete.throwing-hook"), false);
});

