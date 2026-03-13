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
