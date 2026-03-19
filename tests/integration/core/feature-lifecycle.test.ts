/**
 * @module tests/integration/core/feature-lifecycle
 *
 * LAYER: Integration
 * OWNS:  Feature lifecycle hooks and middleware behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore } from "../../../src/store.js";
import { installAllFeatures } from "../../../src/install.js";
import { configureStroid } from "../../../src/config.js";
import { registerStoreFeature, resetRegisteredStoreFeaturesForTests, setFeatureRegistrationHook } from "../../../src/features/feature-registry.js";
import { featureRuntimes, initializeRegisteredFeatureRuntimes } from "../../../src/core/store-lifecycle/registry.js";
import { runFeatureDeleteHooks, resolveFeatureAvailability } from "../../../src/core/store-lifecycle/hooks.js";
import { runMiddleware, runStoreHook, MIDDLEWARE_ABORT } from "../../../src/features/lifecycle.js";

test("feature delete hooks and availability normalization", () => {
  resetRegisteredStoreFeaturesForTests();
  featureRuntimes.clear();
  setFeatureRegistrationHook((name, factory) => {
    if (!featureRuntimes.get(name)) featureRuntimes.set(name, factory());
  });
  configureStroid({ strictMissingFeatures: false });
  registerStoreFeature("temp", () => ({
    beforeStoreDelete: () => undefined,
    afterStoreDelete: () => undefined,
  }));
  clearAllStores();
  createStore("featStore", { value: 1 });
  runFeatureDeleteHooks("featStore", { value: 1 }, () => undefined);

  const normalized = resolveFeatureAvailability("featStore", {
    persist: true,
    sync: true,
    devtools: true,
    explicitPersist: true,
    explicitSync: true,
    explicitDevtools: true,
    historyLimit: 10,
    redactor: (s) => s,
    scope: "request",
    snapshot: "deep",
    version: 1,
    validate: undefined,
    middleware: [],
    onCreate: undefined,
    onSet: undefined,
    onReset: undefined,
    onDelete: undefined,
    onError: undefined,
    lifecycle: {},
  } as any);
  assert.strictEqual(normalized.persist, null);
  assert.strictEqual(normalized.sync, false);
  assert.strictEqual(normalized.devtools, false);
  installAllFeatures();
  initializeRegisteredFeatureRuntimes();
});

test("runMiddleware aborts on promises and warns on undefined results", () => {
  const issues: string[] = [];
  const warnings: string[] = [];
  const payload = { action: "set", prev: { value: 1 }, next: { value: 2 }, path: null };

  const abort = runMiddleware({
    name: "mw",
    payload,
    middlewares: [() => Promise.resolve() as unknown as any],
    reportIssue: (message) => issues.push(message),
    warn: (message) => warnings.push(message),
  });
  assert.strictEqual(abort, MIDDLEWARE_ABORT);
  assert.ok(issues.some((message) => message.includes("must be synchronous")));

  const passThrough = runMiddleware({
    name: "mw2",
    payload,
    middlewares: [() => undefined],
    reportIssue: () => undefined,
    warn: (message) => warnings.push(message),
  });
  assert.deepStrictEqual(passThrough, payload.next);
  assert.ok(warnings.some((message) => message.includes("returned undefined")));
});

test("runStoreHook reports errors", () => {
  const issues: string[] = [];
  runStoreHook({
    name: "hookStore",
    label: "onSet",
    fn: () => {
      throw new Error("hook boom");
    },
    args: [],
    reportIssue: (message) => issues.push(message),
  });
  assert.ok(issues.some((message) => message.includes("onSet")));
});
