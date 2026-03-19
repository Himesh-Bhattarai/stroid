/**
 * @module tests/regression/warning-sets
 *
 * LAYER: Regression
 * OWNS:  Warning dedupe sets reset when stores are deleted.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, deleteStore, setStore } from "../../src/store.js";
import { configureStroid, resetConfig } from "../../src/config.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("slow mutator warnings are released after store deletion", () => {
  resetAllStoresForTest();
  const warnings: string[] = [];
  configureStroid({
    logSink: {
      warn: (msg: string) => warnings.push(msg),
    },
  });

  const originalNow = Date.now;
  try {
    createStore("warnStore", { value: 0 });
    let calls = 0;
    Date.now = () => (calls++ === 0 ? 1 : 100);
    setStore("warnStore", (draft: { value: number }) => {
      draft.value = 1;
    });
    assert.ok(warnings.some((msg) => msg.includes('setStore("warnStore", mutator)')));

    deleteStore("warnStore");
    warnings.length = 0;

    createStore("warnStore", { value: 0 });
    calls = 0;
    Date.now = () => (calls++ === 0 ? 1 : 100);
    setStore("warnStore", (draft: { value: number }) => {
      draft.value = 2;
    });
    assert.ok(warnings.some((msg) => msg.includes('setStore("warnStore", mutator)')));
  } finally {
    Date.now = originalNow;
    resetConfig();
  }
});
