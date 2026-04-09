/**
 * @module tests/integration/hydration-consistency
 *
 * LAYER: Integration
 * OWNS:  Coverage for post-hydration consistency contracts, replay, and drift tooling.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  getStore,
  hydrateStores,
  replaceStore,
  setStore,
} from "../../src/store.js";
import { fetchStore } from "../../src/async.js";
import {
  getHydrationConsistency,
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "../../src/runtime-tools/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { applyFeatureState } from "../../src/core/store-lifecycle/registry.js";

const wait = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate: () => boolean, timeoutMs = 500, intervalMs = 5): Promise<boolean> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await wait(intervalMs);
  }
  return predicate();
};

type RemoteState = { data: string | null; loading: boolean; error: string | null; status: string };

test("hydrateStores exposes hydration consistency metadata through runtime-tools", () => {
  resetAllStoresForTest();
  createStore("profile", { name: "server" });

  hydrateStores(
    { profile: { name: "server" } },
    {},
    { allowTrusted: true },
    {
      contract: {
        snapshotVersion: 7,
        timestamp: 1_717_171_717,
        stores: {
          profile: {
            authority: "server-authoritative",
            schemaSignature: "profile@1",
          },
        },
      },
    }
  );

  const report = getHydrationConsistency("profile");
  assert.ok(report && !Array.isArray(report));
  assert.strictEqual(report.snapshotVersion, 7);
  assert.strictEqual(report.timestamp, 1_717_171_717);
  assert.strictEqual(report.schemaSignature, "profile@1");
  assert.strictEqual(report.authority, "server-authoritative");
  assert.strictEqual(report.policy, "server_wins");
  assert.strictEqual(report.driftCount, 0);
});

test("hydration boot window defers early writes and replays mutators in order", async () => {
  resetAllStoresForTest();
  createStore("counter", { count: 0 });

  hydrateStores(
    { counter: { count: 0 } },
    {},
    { allowTrusted: true },
    {
      bootWindowMs: 20,
      policyMap: {
        counter: "client_wins",
      },
    }
  );

  setStore("counter", (draft: { count: number }) => {
    draft.count += 1;
  });
  setStore("counter", (draft: { count: number }) => {
    draft.count += 1;
  });

  assert.deepStrictEqual(getStore("counter"), { count: 0 });
  assert.deepStrictEqual(getHydrationDriftMetrics(), {
    driftEvents: 0,
    queuedWrites: 2,
    replayedWrites: 0,
    reconciliations: 0,
    invalidations: 0,
    pendingWrites: 2,
    bootWindowActive: true,
    bootWindowMode: "timer",
    bootWindowEndsAtMs: getHydrationDriftMetrics().bootWindowEndsAtMs,
    manualCloseAvailable: false,
  });

  await wait(30);

  assert.deepStrictEqual(getStore("counter"), { count: 2 });
  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, 2);
  assert.strictEqual(metrics.replayedWrites, 2);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.strictEqual(metrics.bootWindowActive, false);
  assert.strictEqual(metrics.bootWindowMode, "timer");
  assert.strictEqual(metrics.manualCloseAvailable, false);
});

test("manual hydration boot window stays queued until the returned control closes it", async () => {
  resetAllStoresForTest();
  createStore("draft", { value: "server" });

  const hydration = hydrateStores(
    { draft: { value: "server" } },
    {},
    { allowTrusted: true },
    {
      bootWindow: {
        mode: "manual",
      },
      policyMap: {
        draft: "client_wins",
      },
    }
  );

  assert.ok(hydration.bootWindow);
  assert.strictEqual(hydration.bootWindow?.mode, "manual");
  assert.strictEqual(hydration.bootWindow?.isActive(), true);
  assert.strictEqual(getHydrationDriftMetrics().manualCloseAvailable, true);
  assert.strictEqual(getHydrationDriftMetrics().bootWindowMode, "manual");

  setStore("draft", "value", "client");

  assert.deepStrictEqual(getStore("draft"), { value: "server" });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 1);

  await wait(25);

  assert.deepStrictEqual(getStore("draft"), { value: "server" });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 1);

  hydration.bootWindow?.close();

  assert.strictEqual(hydration.bootWindow?.isActive(), false);
  assert.deepStrictEqual(getStore("draft"), { value: "client" });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 0);
  assert.strictEqual(getHydrationDriftMetrics().bootWindowActive, false);
});

test("manual hydration boot window can fall back to an automatic close", async () => {
  resetAllStoresForTest();
  createStore("fallbackDraft", { value: "server" });

  const hydration = hydrateStores(
    { fallbackDraft: { value: "server" } },
    {},
    { allowTrusted: true },
    {
      bootWindow: {
        mode: "manual",
        fallbackMs: 15,
      },
      policyMap: {
        fallbackDraft: "client_wins",
      },
    }
  );

  assert.ok(hydration.bootWindow);
  assert.strictEqual(hydration.bootWindow?.mode, "manual");
  assert.strictEqual(hydration.bootWindow?.isActive(), true);

  setStore("fallbackDraft", "value", "client");

  assert.deepStrictEqual(getStore("fallbackDraft"), { value: "server" });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 1);

  await wait(25);

  assert.deepStrictEqual(getStore("fallbackDraft"), { value: "client" });
  assert.strictEqual(hydration.bootWindow?.isActive(), false);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.bootWindowMode, "manual");
  assert.strictEqual(metrics.manualCloseAvailable, true);
  assert.strictEqual(metrics.bootWindowActive, false);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.strictEqual(metrics.queuedWrites, 1);
  assert.strictEqual(metrics.replayedWrites, 1);
});

test("hydration boot window defers slow network revalidation until replay", async () => {
  resetAllStoresForTest();
  createStore("remote", {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  });

  const hydration = hydrateStores(
    {
      remote: {
        data: "server",
        loading: false,
        error: null,
        status: "success",
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindow: {
        mode: "manual",
      },
      policyMap: {
        remote: "client_wins",
      },
    }
  );

  const controller = new AbortController();
  const request = fetchStore(
    "remote",
    async () => {
      await wait(5);
      return "fresh";
    },
    {
      dedupe: false,
      signal: controller.signal,
    }
  );

  await wait(10);

  assert.deepStrictEqual(getStore("remote"), {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 2);

  await request;

  assert.deepStrictEqual(getStore("remote"), {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  });

  hydration.bootWindow?.close();
  await wait(20);

  const remote = getStore("remote") as RemoteState | null;
  assert.strictEqual(remote?.data, "fresh");
  assert.strictEqual(remote?.loading, false);

  const events = getHydrationDriftEvents(2);
  assert.deepStrictEqual(events.map((event) => event.source), ["network", "network"]);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, 2);
  assert.strictEqual(metrics.replayedWrites, 2);
  assert.strictEqual(metrics.pendingWrites, 0);
});

test("server_wins drift policy restores the hydrated baseline and records diagnostics", () => {
  resetAllStoresForTest();
  createStore("profile", { name: "server" });

  hydrateStores(
    { profile: { name: "server" } },
    {},
    { allowTrusted: true },
    {
      contract: {
        snapshotVersion: "req-1",
      },
      policyMap: {
        profile: "server_wins",
      },
    }
  );

  setStore("profile", "name", "client");

  assert.deepStrictEqual(getStore("profile"), { name: "server" });

  const [event] = getHydrationDriftEvents(1);
  assert.ok(event);
  assert.strictEqual(event.store, "profile");
  assert.strictEqual(event.source, "effect");
  assert.strictEqual(event.policy, "server_wins");
  assert.strictEqual(event.resolution, "server_reverted");
  assert.strictEqual(event.metadata.snapshotVersion, "req-1");

  const report = getHydrationConsistency("profile");
  assert.ok(report && !Array.isArray(report));
  assert.strictEqual(report.driftCount, 1);
  assert.strictEqual(report.lastResolution, "server_reverted");
});

test("merge policy combines hydrated baseline fields with client drift", () => {
  resetAllStoresForTest();
  createStore("settings", {
    theme: "light",
    lang: "en",
    nested: { server: true, client: false },
  });

  hydrateStores(
    {
      settings: {
        theme: "light",
        lang: "en",
        nested: { server: true, client: false },
      },
    },
    {},
    { allowTrusted: true },
    {
      contract: {
        stores: {
          settings: {
            authority: "mergeable",
          },
        },
      },
      policyMap: {
        settings: "merge",
      },
    }
  );

  setStore("settings", {
    lang: "np",
    nested: { client: true },
  } as unknown as Partial<{ theme: string; lang: string; nested: { server: boolean; client: boolean } }>);

  assert.deepStrictEqual(getStore("settings"), {
    theme: "light",
    lang: "np",
    nested: { server: true, client: true },
  });

  const [event] = getHydrationDriftEvents(1);
  assert.strictEqual(event?.resolution, "merged");
});

test("feature-driven storage and sync writes surface drift source hints", () => {
  resetAllStoresForTest();
  createStore("prefs", { theme: "light" });
  createStore("presence", { online: false });

  hydrateStores(
    {
      prefs: { theme: "light" },
      presence: { online: false },
    },
    {},
    { allowTrusted: true },
    {
      policyMap: {
        prefs: "client_wins",
        presence: "client_wins",
      },
    }
  );

  applyFeatureState("prefs", { theme: "dark" }, Date.now(), {
    source: "storage",
    validate: (candidate) => ({ ok: true, value: candidate }),
  });
  applyFeatureState("presence", { online: true }, Date.now(), {
    source: "sync",
    validate: (candidate) => ({ ok: true, value: candidate }),
  });

  const events = getHydrationDriftEvents(2);
  assert.strictEqual(events[0]?.source, "storage");
  assert.strictEqual(events[1]?.source, "sync");
});

test("invalidate_and_refetch marks drift and accepts the replayed network refresh", async () => {
  resetAllStoresForTest();
  createStore("remote", {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  });

  const controller = new AbortController();
  await fetchStore("remote", () => Promise.resolve("fresh"), { signal: controller.signal });
  replaceStore("remote", {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  } as RemoteState);

  let invalidations = 0;
  hydrateStores(
    {
      remote: {
        data: "server",
        loading: false,
        error: null,
        status: "success",
      },
    },
    {},
    { allowTrusted: true },
    {
      policyMap: {
        remote: {
          policy: "invalidate_and_refetch",
          onInvalidate: () => {
            invalidations += 1;
          },
        },
      },
    }
  );

  replaceStore("remote", {
    data: "client",
    loading: false,
    error: null,
    status: "success",
  } as RemoteState);

  const [event] = getHydrationDriftEvents(1);
  assert.strictEqual(event?.resolution, "invalidated");
  assert.strictEqual(invalidations, 1);

  const refreshed = await waitFor(() => {
    const snapshot = getStore("remote") as RemoteState | null;
    return snapshot?.data === "fresh";
  });
  assert.ok(refreshed);

  const remote = getStore("remote") as RemoteState | null;
  assert.strictEqual(remote?.data, "fresh");
  assert.strictEqual(getHydrationDriftMetrics().invalidations, 1);
});
