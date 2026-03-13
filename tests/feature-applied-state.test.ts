import test from "node:test";
import assert from "node:assert";
import { createStore, getStore } from "../src/store.js";
import { clearAllStores } from "../src/runtime-admin.js";
import {
  applyFeatureState,
  validatePathSafety,
  clearPathValidationCache,
} from "../src/store-lifecycle.js";

test("applyFeatureState invalidates path validation cache for feature updates", () => {
  clearAllStores();
  clearPathValidationCache();

  createStore("featureApplied", { user: { name: "Ada" } });
  const base = getStore("featureApplied");
  const first = validatePathSafety("featureApplied", base, "user.name", "Grace");
  assert.strictEqual(first.ok, true);

  applyFeatureState("featureApplied", { user: null } as any);
  const next = getStore("featureApplied");
  const second = validatePathSafety("featureApplied", next, "user.name", "Grace");
  assert.strictEqual(second.ok, false);

  clearAllStores();
  clearPathValidationCache();
});

test("path validation cache evicts least-recently-used entries per store", () => {
  clearAllStores();
  clearPathValidationCache();

  const maxEntries = 500;
  const total = maxEntries + 1;
  const seed: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    seed[`k${i}`] = i;
  }

  createStore("pathLruStore", seed);
  const base = getStore("pathLruStore") as Record<string, number>;

  for (let i = 0; i < total; i++) {
    const verdict = validatePathSafety("pathLruStore", base, `k${i}`, i + 1);
    assert.strictEqual(verdict.ok, true);
  }

  const mutated = { ...base };
  delete mutated.k0;
  delete mutated[`k${total - 1}`];

  const oldest = validatePathSafety("pathLruStore", mutated, "k0", 123);
  const newest = validatePathSafety("pathLruStore", mutated, `k${total - 1}`, 123);

  assert.strictEqual(oldest.ok, false);
  assert.strictEqual(newest.ok, true);

  clearAllStores();
  clearPathValidationCache();
});
