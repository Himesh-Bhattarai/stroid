/**
 * @module tests/regression/hydration-randomized
 *
 * LAYER: Regression
 * OWNS:  Randomized replay parity and error-hardening coverage for post-hydration consistency.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { applyFeatureState } from "../../src/core/store-lifecycle/registry.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { getHydrationDriftEvents } from "../../src/runtime-tools/index.js";
import { createStore, getStore, hydrateStores, setStore } from "../../src/store.js";
import {
  runRandomizedHydrationScenario,
  createBaselineState,
  type RandomizedPolicy,
  type RandomizedState,
} from "../../scripts/hydration-randomized-shared.js";

test("randomized hydration replay matches immediate execution across core policies", async () => {
  const seeds = [11, 29, 101, 303];
  const policies: RandomizedPolicy[] = ["client_wins", "server_wins", "merge"];

  for (const seed of seeds) {
    for (const policy of policies) {
      const immediate = await runRandomizedHydrationScenario({
        seed,
        policy,
        queued: false,
        steps: 24,
      });
      const queued = await runRandomizedHydrationScenario({
        seed,
        policy,
        queued: true,
        steps: 24,
      });

      assert.deepStrictEqual(
        queued.finalState,
        immediate.finalState,
        `queued replay diverged for seed=${seed} policy=${policy}`,
      );
      assert.deepStrictEqual(
        queued.eventSummary,
        immediate.eventSummary,
        `drift event order diverged for seed=${seed} policy=${policy}`,
      );
      assert.strictEqual(
        queued.driftEvents,
        immediate.driftEvents,
        `drift event count diverged for seed=${seed} policy=${policy}`,
      );
      assert.strictEqual(
        queued.queuedWrites,
        queued.operations,
        `expected every operation to queue during boot window for seed=${seed} policy=${policy}`,
      );
      assert.strictEqual(
        queued.replayedWrites,
        queued.operations,
        `expected every queued operation to replay for seed=${seed} policy=${policy}`,
      );
      assert.strictEqual(immediate.queuedWrites, 0);
      assert.strictEqual(immediate.replayedWrites, 0);
    }
  }
});

test("merge reconciliation falls back to the hydrated baseline when a custom merge throws", () => {
  resetAllStoresForTest();
  const baseline = createBaselineState(7);
  createStore("mergeThrow", baseline);

  hydrateStores(
    { mergeThrow: baseline },
    {},
    { allowTrusted: true },
    {
      policyMap: {
        mergeThrow: {
          policy: "merge",
          merge: () => {
            throw new Error("merge boom");
          },
        },
      },
    },
  );

  assert.doesNotThrow(() => {
    setStore("mergeThrow", (draft: RandomizedState) => {
      draft.counter += 99;
      draft.tags = [...draft.tags, "client"];
    });
  });

  assert.deepStrictEqual(getStore("mergeThrow"), baseline);
  const [event] = getHydrationDriftEvents(1);
  assert.ok(event);
  assert.strictEqual(event.resolution, "server_reverted");
  assert.strictEqual(event.policy, "merge");
});

test("reconciliation falls back to the hydrated baseline when normalization throws", () => {
  resetAllStoresForTest();
  const baseline = createBaselineState(9);
  createStore("normalizeThrow", baseline);

  hydrateStores(
    { normalizeThrow: baseline },
    {},
    { allowTrusted: true },
    {
      policyMap: {
        normalizeThrow: "merge",
      },
    },
  );

  applyFeatureState(
    "normalizeThrow",
    {
      ...baseline,
      counter: baseline.counter + 5,
      meta: {
        ...baseline.meta,
        source: "sync",
      },
    },
    Date.now(),
    {
      source: "sync",
      validate: () => {
        throw new Error("normalize boom");
      },
    },
  );

  assert.deepStrictEqual(getStore("normalizeThrow"), baseline);
  const [event] = getHydrationDriftEvents(1);
  assert.ok(event);
  assert.strictEqual(event.resolution, "server_reverted");
  assert.strictEqual(event.policy, "merge");
});
