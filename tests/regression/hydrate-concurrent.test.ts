/**
 * @module tests/regression/hydrate-concurrent
 *
 * LAYER: Regression
 * OWNS:  Concurrent hydrateStores collision semantics for overlapping store keys.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getStore, hydrateStores } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("concurrent hydrateStores calls on the same key do not double-create or corrupt state", async () => {
  resetAllStoresForTest();

  const trust = { allowTrusted: true } as const;
  const [left, right] = await Promise.all([
    Promise.resolve().then(() => hydrateStores({ hydrateRace: { value: 1 } }, {}, trust)),
    Promise.resolve().then(() => hydrateStores({ hydrateRace: { value: 2 } }, {}, trust)),
  ]);

  const final = getStore("hydrateRace") as { value: number } | null;
  assert.ok(final !== null, "hydrateRace should be materialized");
  assert.ok(final?.value === 1 || final?.value === 2, `unexpected final value: ${String(final?.value)}`);

  const createdCount = Number(left.created.includes("hydrateRace")) + Number(right.created.includes("hydrateRace"));
  const hydratedCount = Number(left.hydrated.includes("hydrateRace")) + Number(right.hydrated.includes("hydrateRace"));

  assert.strictEqual(createdCount, 1, "expected exactly one create path across concurrent hydrates");
  assert.strictEqual(hydratedCount, 1, "expected exactly one hydrate path across concurrent hydrates");
  assert.ok(!left.created.includes("hydrateRace") || !left.hydrated.includes("hydrateRace"));
  assert.ok(!right.created.includes("hydrateRace") || !right.hydrated.includes("hydrateRace"));
});
