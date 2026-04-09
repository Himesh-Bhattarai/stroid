/**
 * @module tests/regression/perf-queue-and-cleanup
 *
 * LAYER: Regression
 * OWNS:  Guards for large hydration queue gating and destroy-time cleanup paths.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createLargePayloadState } from "../../scripts/hydration/hydration-large-payload-shared.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { installDevtools } from "../../src/features/devtools.js";
import { getHydrationDriftMetrics } from "../../src/runtime-tools/index.js";
import { deepClone } from "../../src/utils.js";
import { createStore, deleteStore, getStore, hydrateStores, setStore, subscribeStore } from "../../src/store.js";
import { getRegistry } from "../../src/core/store-lifecycle/registry.js";
import { _getFeatureContextCountForTests } from "../../src/core/store-lifecycle/hooks.js";
import { estimateHydrationEntryBytesForTests } from "../../src/core/store-hydrate-impl.js";

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

test("large hydrate snapshot auto-enables short queue window when consistency bootWindow is omitted", async () => {
  resetAllStoresForTest();
  const baseline = createLargePayloadState(512);
  createStore("autoQueueHydration", baseline);

  const hydration = hydrateStores(
    { autoQueueHydration: deepClone(baseline) },
    {},
    { allowTrusted: true },
    {
      policyMap: {
        autoQueueHydration: "client_wins",
      },
    },
  );

  assert.ok(hydration.bootWindow);
  assert.strictEqual(hydration.bootWindow?.mode, "timer");

  setStore("autoQueueHydration", (draft: ReturnType<typeof createLargePayloadState>) => {
    draft.meta.revision += 1;
  });
  await Promise.resolve();
  setStore("autoQueueHydration", (draft: ReturnType<typeof createLargePayloadState>) => {
    draft.meta.revision += 1;
  });

  await wait(8);

  const state = getStore("autoQueueHydration") as ReturnType<typeof createLargePayloadState> | null;
  assert.ok(state);
  assert.strictEqual(state?.meta.revision, baseline.meta.revision + 2);

  const metrics = getHydrationDriftMetrics();
  assert.ok(metrics.queuedWrites >= 1);
  assert.ok(metrics.replayedWrites >= 1);
});

test("small hydrate snapshot does not auto-enable queue window", () => {
  resetAllStoresForTest();
  createStore("autoQueueHydrationSmall", { value: "ok" });

  const hydration = hydrateStores(
    { autoQueueHydrationSmall: { value: "ok" } },
    {},
    { allowTrusted: true },
    {
      policyMap: {
        autoQueueHydrationSmall: "client_wins",
      },
    },
  );

  assert.strictEqual(hydration.bootWindow, undefined);
});

test("large hydration size estimator short-circuits before JSON serialization", () => {
  const originalStringify = JSON.stringify;
  let stringifyCalls = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    stringifyCalls += 1;
    return originalStringify(...args);
  }) as typeof JSON.stringify;

  try {
    const estimateLarge = estimateHydrationEntryBytesForTests({
      payload: "x".repeat(400 * 1024),
    });
    assert.strictEqual(estimateLarge, 256 * 1024);
    assert.strictEqual(stringifyCalls, 0);

    const estimateSmall = estimateHydrationEntryBytesForTests({ payload: "ok" });
    assert.ok(estimateSmall > 0);
    assert.ok(stringifyCalls >= 1);
  } finally {
    JSON.stringify = originalStringify;
  }
});

test("deleteStore fully clears subscriber and feature-hook context state for destroyed stores", () => {
  resetAllStoresForTest();
  installDevtools();

  createStore("destroyCleanupStore", { value: 0 }, { devtools: true });
  for (let index = 0; index < 256; index += 1) {
    subscribeStore("destroyCleanupStore", () => {});
  }
  setStore("destroyCleanupStore", { value: 1 });

  const registry = getRegistry();
  assert.ok(registry.notify.pendingNotifications.has("destroyCleanupStore"));
  assert.ok(_getFeatureContextCountForTests(registry) > 0);

  deleteStore("destroyCleanupStore");

  assert.strictEqual(registry.subscribers.destroyCleanupStore, undefined);
  assert.strictEqual(registry.notify.pendingNotifications.has("destroyCleanupStore"), false);
  assert.ok(!registry.notify.pendingBuffer.includes("destroyCleanupStore"));
  assert.ok(!registry.notify.orderedNames.includes("destroyCleanupStore"));
  assert.strictEqual(_getFeatureContextCountForTests(registry), 0);
});
