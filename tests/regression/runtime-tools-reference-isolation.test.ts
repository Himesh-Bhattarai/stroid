/**
 * @module tests/regression/runtime-tools-reference-isolation
 *
 * LAYER: Regression
 * OWNS:  Runtime-tools must not leak mutable references into live hydration/meta runtime state.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStore, getStore, hydrateStores, setStore } from "../../src/store.js";
import { installPersist } from "../../src/persist.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { getHydrationConsistency, getStoreMeta } from "../../src/runtime-tools/index.js";

const wait = async (ms = 0): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 500,
  intervalMs = 10,
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await wait(intervalMs);
  }
  assert.ok(predicate(), "waitFor predicate timed out");
};

test("getHydrationConsistency(name) returns an isolated baseline snapshot", () => {
  resetAllStoresForTest();
  createStore("runtime.hydration.reference", { count: 1 });

  hydrateStores(
    { "runtime.hydration.reference": { count: 1 } },
    {},
    { allowTrusted: true },
    {
      contract: { authority: "server-authoritative" },
      policyMap: { "runtime.hydration.reference": "server_wins" },
    },
  );

  const report = getHydrationConsistency("runtime.hydration.reference");
  assert.ok(report && !Array.isArray(report));

  (report.baseline as { count: number }).count = 999;

  setStore("runtime.hydration.reference", { count: 2 });
  assert.deepStrictEqual(getStore("runtime.hydration.reference"), { count: 1 });

  const fresh = getHydrationConsistency("runtime.hydration.reference");
  assert.ok(fresh && !Array.isArray(fresh));
  assert.deepStrictEqual(fresh.baseline, { count: 1 });
});

test("getStoreMeta returns isolated nested option objects", async () => {
  resetAllStoresForTest();
  installPersist();

  let originalWrites = 0;
  let tamperedWrites = 0;

  const driver = {
    getItem: () => null,
    setItem: () => {
      originalWrites += 1;
    },
    removeItem: () => undefined,
  };

  createStore("runtime.meta.reference", { value: 1 }, {
    persist: {
      key: "runtime.meta.reference",
      driver,
      allowPlaintext: true,
    },
  });

  await waitFor(() => originalWrites > 0);
  originalWrites = 0;

  const meta = getStoreMeta("runtime.meta.reference");
  assert.ok(meta);
  assert.ok(meta.options.persist && typeof meta.options.persist === "object");

  const tamperedSetItem = () => {
    tamperedWrites += 1;
  };
  (meta.options.persist as { driver?: { setItem?: () => void } }).driver!.setItem = tamperedSetItem;

  setStore("runtime.meta.reference", { value: 2 });
  await waitFor(() => originalWrites > 0);
  await wait(20);

  assert.strictEqual(tamperedWrites, 0);
  assert.ok(originalWrites > 0);

  const nextMeta = getStoreMeta("runtime.meta.reference");
  assert.ok(nextMeta?.options.persist && typeof nextMeta.options.persist === "object");
  const nextSetItem = (nextMeta.options.persist as { driver?: { setItem?: () => void } }).driver?.setItem;
  assert.notStrictEqual(nextSetItem, tamperedSetItem);
});

