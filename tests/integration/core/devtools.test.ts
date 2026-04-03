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
import { normalizeStoreOptions } from "../../../src/adapters/options.js";
import { deepClone } from "../../../src/utils.js";

test("devtools api returns safe defaults without feature registration", () => {
  assert.deepStrictEqual(getHistory("missing"), []);
  clearHistory("missing");
});

test("devtools feature sends updates and clears history", () => {
  type ReduxDevtoolsExtension = { connect: () => { init: () => void; send: () => void } };
  const windowWithDevtools = window as unknown as Window & { __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevtoolsExtension };
  const original = windowWithDevtools.__REDUX_DEVTOOLS_EXTENSION__;
  let sends = 0;
  const devtoolsMock = {
    init: () => undefined,
    send: () => {
      sends += 1;
      if (sends === 1) throw new Error("devtools send boom");
    },
  };
  windowWithDevtools.__REDUX_DEVTOOLS_EXTENSION__ = {
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
  windowWithDevtools.__REDUX_DEVTOOLS_EXTENSION__ = original;
});

test("devtools runtime trims history, clones safely, and clears history", () => {
  const warnings: string[] = [];
  const runtime = createDevtoolsFeatureRuntime();
  type CreateCtx = Parameters<NonNullable<typeof runtime.onStoreCreate>>[0];
  type WriteCtx = Parameters<NonNullable<typeof runtime.onStoreWrite>>[0];
  const options = normalizeStoreOptions({ devtools: true, historyLimit: 1, redactor: undefined }, "devStore");

  const storeValue = { value: 1, big: BigInt(1) };
  const ctxBase: CreateCtx = {
    name: "devStore",
    options,
    getMeta: () => undefined,
    getStoreValue: () => storeValue,
    getAllStores: () => ({ devStore: { value: 1 } }),
    getInitialState: () => ({ value: 1 }),
    hasStore: () => true,
    setStoreValue: () => undefined,
    applyFeatureState: (value) => value,
    notify: () => undefined,
    reportStoreError: () => undefined,
    warn: (message: string) => warnings.push(message),
    warnAlways: (message: string) => warnings.push(message),
    log: () => undefined,
    hashState: () => 0,
    deepClone,
    sanitize: (value) => value,
    validate: (next) => ({ ok: true, value: next }),
    isDev: () => true,
  };

  runtime.onStoreCreate(ctxBase);
  assert.ok(warnings.some((message) => message.includes("DevTools requested")));

  runtime.onStoreWrite({
    ...ctxBase,
    action: "set",
    prev: { value: 1 },
    next: { value: 2 },
    getStoreValue: () => ({ value: 2, big: BigInt(2) }),
  } satisfies WriteCtx);
  runtime.onStoreWrite({
    ...ctxBase,
    action: "set",
    prev: { value: 2 },
    next: { value: 3 },
    getStoreValue: () => ({ value: 3, big: BigInt(3) }),
  } satisfies WriteCtx);

  const globalWithClone = globalThis as typeof globalThis & { structuredClone?: typeof structuredClone };
  const originalClone = globalWithClone.structuredClone;
  try {
    globalWithClone.structuredClone = undefined;
    const history = runtime.api?.getHistory?.("devStore");
    assert.ok(Array.isArray(history));
  } finally {
    globalWithClone.structuredClone = originalClone;
  }

  runtime.api?.clearHistory?.();
  const cleared = runtime.api?.getHistory?.("devStore");
  assert.deepStrictEqual(cleared, []);
});
