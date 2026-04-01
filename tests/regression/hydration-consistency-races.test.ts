/**
 * @module tests/regression/hydration-consistency-races
 *
 * LAYER: Regression
 * OWNS:  Ordering regressions for boot-window replay across storage and sync sources.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  createStore,
  getStore,
  hydrateStores,
} from "../../src/store.js";
import {
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "../../src/runtime-tools/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { applyFeatureState } from "../../src/core/store-lifecycle/registry.js";

const wait = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

test("boot window preserves insertion order between stale storage restore and sync burst replay", async () => {
  resetAllStoresForTest();
  createStore("timeline", {
    revision: 0,
    source: "server",
  });

  hydrateStores(
    {
      timeline: {
        revision: 0,
        source: "server",
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindowMs: 20,
      policyMap: {
        timeline: "client_wins",
      },
    }
  );

  applyFeatureState("timeline", {
    revision: 1,
    source: "storage",
  }, Date.now(), {
    source: "storage",
    validate: (candidate) => ({ ok: true, value: candidate }),
  });
  applyFeatureState("timeline", {
    revision: 2,
    source: "sync",
  }, Date.now(), {
    source: "sync",
    validate: (candidate) => ({ ok: true, value: candidate }),
  });
  applyFeatureState("timeline", {
    revision: 3,
    source: "sync",
  }, Date.now(), {
    source: "sync",
    validate: (candidate) => ({ ok: true, value: candidate }),
  });

  assert.deepStrictEqual(getStore("timeline"), {
    revision: 0,
    source: "server",
  });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 3);

  await wait(30);

  assert.deepStrictEqual(getStore("timeline"), {
    revision: 3,
    source: "sync",
  });

  const events = getHydrationDriftEvents(3);
  assert.deepStrictEqual(events.map((event) => event.source), ["storage", "sync", "sync"]);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, 3);
  assert.strictEqual(metrics.replayedWrites, 3);
  assert.strictEqual(metrics.pendingWrites, 0);
});
