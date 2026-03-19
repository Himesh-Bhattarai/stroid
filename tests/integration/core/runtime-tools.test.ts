/**
 * @module tests/integration/core/runtime-tools
 *
 * LAYER: Integration
 * OWNS:  Runtime admin/tools, namespace, and registry behaviors.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, clearAllStores, hasStore, getStore } from "../../../src/store.js";
import { installAllFeatures } from "../../../src/install.js";
import { store, namespace } from "../../../src/core/store-name.js";
import { getMetrics } from "../../../src/core/store-read.js";
import { clearStores } from "../../../src/runtime-admin/index.js";
import { listStores, getStoreMeta, getPersistQueueDepth, getAsyncInflightCount } from "../../../src/runtime-tools/index.js";
import { configureStroid } from "../../../src/config.js";
import { getNamespace, setNamespace } from "../../../src/internals/config.js";
import { setRegistryScope, getStoreRegistry, resetAllStoreRegistriesForTests, clearRegistryScopeOverrideForTests } from "../../../src/core/store-registry.js";

test("runtime admin clears stores by pattern", () => {
  clearAllStores();
  createStore("pat::one", { value: 1 });
  createStore("pat::two", { value: 2 });
  createStore("other", { value: 3 });

  clearStores("pat::*");
  assert.strictEqual(hasStore("pat::one"), false);
  assert.strictEqual(hasStore("pat::two"), false);
  assert.strictEqual(hasStore("other"), true);
});

test("runtime tools handle missing stores and patterns", () => {
  clearAllStores();
  createStore("tool:one", { value: 1 });
  createStore("tool:two", { value: 2 });

  assert.deepStrictEqual(listStores("tool:*").sort(), ["tool:one", "tool:two"]);
  assert.strictEqual(getStoreMeta("missing"), null);
  assert.strictEqual(getPersistQueueDepth("missing"), 0);
  assert.strictEqual(getAsyncInflightCount("missing"), 0);
});

test("installAllFeatures is callable without throwing", () => {
  installAllFeatures();
});

test("namespace adapts names and store handles", () => {
  clearAllStores();
  const ns = namespace("ns");
  ns.create("user", { value: 1 });
  ns.set("user", "value", 2);
  assert.strictEqual(ns.get("user", "value"), 2);
  ns.create("already::scoped", { value: 5 });
  assert.strictEqual(ns.get("already::scoped", "value"), 5);

  const handle = store("raw");
  createStore("ns::raw", { value: 3 });
  ns.set(handle, "value", 4);
  assert.strictEqual(ns.get(handle, "value"), 4);
});

test("getMetrics returns null for missing store", () => {
  assert.strictEqual(getMetrics("missing-metrics"), null);
});

test("store registry scope and resets clear registries", () => {
  const registry = getStoreRegistry("file.ts");
  registry.stores["x"] = 1;
  setRegistryScope("file2.ts");
  const nextRegistry = getStoreRegistry("file2.ts");
  assert.notStrictEqual(nextRegistry, registry);
  resetAllStoreRegistriesForTests();
  clearRegistryScopeOverrideForTests();
});

test("configureStroid covers namespace and missing immer produce", () => {
  const original = getNamespace();
  setNamespace(" scoped ");
  assert.strictEqual(getNamespace(), "scoped");
  setNamespace(original);

  configureStroid({ allowUntrustedHydration: true, middleware: [] });
  configureStroid({ mutatorProduce: "immer" });
});

test("namespace createStrict delegates to strict store creation", () => {
  clearAllStores();
  const ns = namespace("strict");
  ns.createStrict("user", { value: 1 });
  assert.strictEqual(getStore("strict::user", "value"), 1);
});
