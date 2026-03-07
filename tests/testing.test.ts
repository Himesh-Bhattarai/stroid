import test from "node:test";
import assert from "node:assert";
import { createStore, hasStore } from "../src/store.js";
import { resetAllStoresForTest } from "../src/testing.js";

test("resetAllStoresForTest clears registries without firing delete hooks", () => {
  let deletes = 0;

  createStore("testReset", { value: 1 }, {
    onDelete: () => {
      deletes += 1;
    },
  });

  resetAllStoresForTest();

  assert.strictEqual(hasStore("testReset"), false);
  assert.strictEqual(deletes, 0);
});
