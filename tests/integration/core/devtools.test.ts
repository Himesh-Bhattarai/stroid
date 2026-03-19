/**
 * @module tests/integration/core/devtools
 *
 * LAYER: Integration
 * OWNS:  Devtools feature behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, setStore, deleteStore } from "../../../src/store.js";
import { installAllFeatures } from "../../../src/install.js";
import { getHistory, clearHistory } from "../../../src/devtools/api.js";
import { createDevtoolsFeatureRuntime } from "../../../src/features/devtools.js";
import { deepClone } from "../../../src/utils.js";

test("devtools api returns safe defaults without feature registration", () => {
  assert.deepStrictEqual(getHistory("missing"), []);
  clearHistory("missing");
});

test("devtools feature sends updates and clears history", () => {
  const original = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
  let sends = 0;
  const devtoolsMock = {
    init: () => undefined,
    send: () => {
      sends += 1;
      if (sends === 1) throw new Error("devtools send boom");
    },
  };
  (window as any).__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: () => devtoolsMock,
  };

  installAllFeatures();
  createStore("devStore", { value: 1 }, {
    devtools: true,
    historyLimit: 2,
    redactor: () => { throw new Error("redactor boom"); },
  });
  setStore("devStore", "value", 2);
  deleteStore("devStore");

  assert.ok(sends >= 1);
  assert.deepStrictEqual(getHistory("devStore"), []);
  (window as any).__REDUX_DEVTOOLS_EXTENSION__ = original;
});

test("devtools runtime trims history, clones safely, and clears history", () => {
  const warnings: string[] = [];
  const runtime = createDevtoolsFeatureRuntime();
  const ctxBase = {
    name: "devStore",
    options: { devtools: true, historyLimit: 1, redactor: undefined },
    getAllStores: () => ({ devStore: { value: 1 } }),
    getStoreValue: () => ({ value: 1, big: BigInt(1) }),
    warn: (message: string) => warnings.push(message),
    deepClone,
  };

  runtime.onStoreCreate(ctxBase as any);
  assert.ok(warnings.some((message) => message.includes("DevTools requested")));

  runtime.onStoreWrite({ ...ctxBase, action: "set", prev: { value: 1 }, next: { value: 2 }, getStoreValue: () => ({ value: 2, big: BigInt(2) }) } as any);
  runtime.onStoreWrite({ ...ctxBase, action: "set", prev: { value: 2 }, next: { value: 3 }, getStoreValue: () => ({ value: 3, big: BigInt(3) }) } as any);

  const originalClone = (globalThis as any).structuredClone;
  try {
    (globalThis as any).structuredClone = undefined;
    const history = runtime.api?.getHistory?.("devStore");
    assert.ok(Array.isArray(history));
  } finally {
    (globalThis as any).structuredClone = originalClone;
  }

  runtime.api?.clearHistory?.();
  const cleared = runtime.api?.getHistory?.("devStore");
  assert.deepStrictEqual(cleared, []);
});
