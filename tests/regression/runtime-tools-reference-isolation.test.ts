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
import {
  getHydrationConsistency,
  getHydrationDriftEvents,
  getMetrics,
  getStoreMeta,
} from "../../src/runtime-tools/index.js";

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

test("getHydrationConsistency isolates nested metadata in named and list projections", () => {
  resetAllStoresForTest();
  createStore("runtime.hydration.metadata", { value: "server" });

  const marker = { stamp: { version: 1 } };
  hydrateStores(
    { "runtime.hydration.metadata": { value: "server" } },
    {},
    { allowTrusted: true },
    {
      contract: {
        snapshotVersion: marker as unknown as string,
      },
      policyMap: { "runtime.hydration.metadata": "server_wins" },
    },
  );

  const namedReport = getHydrationConsistency("runtime.hydration.metadata");
  assert.ok(namedReport && !Array.isArray(namedReport));
  ((namedReport.snapshotVersion as { stamp: { version: number } }).stamp).version = 999;

  const listReport = (getHydrationConsistency() as Array<{ store: string; snapshotVersion?: unknown }>)
    .find((entry) => entry.store === "runtime.hydration.metadata");
  assert.ok(listReport);
  ((listReport!.snapshotVersion as { stamp: { version: number } }).stamp).version = 888;

  const freshNamed = getHydrationConsistency("runtime.hydration.metadata");
  assert.ok(freshNamed && !Array.isArray(freshNamed));
  assert.deepStrictEqual(freshNamed.snapshotVersion, { stamp: { version: 1 } });

  const freshList = (getHydrationConsistency() as Array<{ store: string; snapshotVersion?: unknown }>)
    .find((entry) => entry.store === "runtime.hydration.metadata");
  assert.ok(freshList);
  assert.deepStrictEqual(freshList!.snapshotVersion, { stamp: { version: 1 } });
});

test("getHydrationDriftEvents returns isolated nested metadata and payload snapshots", () => {
  resetAllStoresForTest();
  createStore("runtime.hydration.events", { profile: { name: "server" } });

  hydrateStores(
    { "runtime.hydration.events": { profile: { name: "server" } } },
    {},
    { allowTrusted: true },
    {
      contract: {
        snapshotVersion: { marker: { id: "release-1" } } as unknown as string,
      },
      policyMap: { "runtime.hydration.events": "server_wins" },
    },
  );

  setStore("runtime.hydration.events", { profile: { name: "client" } });

  const [event] = getHydrationDriftEvents(1);
  assert.ok(event);

  ((event.metadata.snapshotVersion as { marker: { id: string } }).marker).id = "tampered";
  (((event.baseline as { profile: { name: string } }).profile)).name = "tampered-baseline";
  (((event.live as { profile: { name: string } }).profile)).name = "tampered-live";
  (((event.resolved as { profile: { name: string } }).profile)).name = "tampered-resolved";

  const [fresh] = getHydrationDriftEvents(1);
  assert.ok(fresh);
  assert.deepStrictEqual(fresh.metadata.snapshotVersion, { marker: { id: "release-1" } });
  assert.deepStrictEqual(fresh.baseline, { profile: { name: "server" } });
  assert.deepStrictEqual(fresh.live, { profile: { name: "client" } });
  assert.deepStrictEqual(fresh.resolved, { profile: { name: "server" } });
});

test("getStoreMeta and getMetrics isolate collection-shaped projections", () => {
  resetAllStoresForTest();
  createStore(
    "runtime.meta.collections",
    { value: 1 },
    {
      features: {
        inspect: {
          labels: new Set(["stable"]),
          counters: new Map([["one", { value: 1 }]]),
        },
      },
    },
  );

  const metrics = getMetrics("runtime.meta.collections");
  assert.ok(metrics);
  metrics.notifyCount = 999;

  const metricsFresh = getMetrics("runtime.meta.collections");
  assert.ok(metricsFresh);
  assert.notStrictEqual(metricsFresh.notifyCount, 999);

  const meta = getStoreMeta("runtime.meta.collections");
  assert.ok(meta?.options.features && typeof meta.options.features === "object");
  const inspect = (meta.options.features as {
    inspect?: {
      labels?: Set<string>;
      counters?: Map<string, { value: number }>;
    };
  }).inspect;
  assert.ok(inspect?.labels instanceof Set);
  assert.ok(inspect?.counters instanceof Map);

  inspect?.labels?.add("tampered");
  const mapped = inspect?.counters?.get("one");
  if (mapped) mapped.value = 999;

  const fresh = getStoreMeta("runtime.meta.collections");
  assert.ok(fresh?.options.features && typeof fresh.options.features === "object");
  const freshInspect = (fresh.options.features as {
    inspect?: {
      labels?: Set<string>;
      counters?: Map<string, { value: number }>;
    };
  }).inspect;

  assert.deepStrictEqual(Array.from(freshInspect?.labels ?? []), ["stable"]);
  assert.deepStrictEqual(freshInspect?.counters?.get("one"), { value: 1 });
});
