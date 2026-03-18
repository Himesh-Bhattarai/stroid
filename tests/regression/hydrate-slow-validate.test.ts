/**
 * @module tests/regression/hydrate-slow-validate
 *
 * LAYER: Regression
 * OWNS:  Hydration trust validation timing and behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { hydrateStores, getStore } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const spin = (ms: number): void => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // intentional busy wait
  }
};

test("hydrateStores runs slow validation and still hydrates when valid", () => {
  resetAllStoresForTest();
  const start = Date.now();

  const result = hydrateStores(
    { slowValidate: { value: 1 } },
    {},
    {
      allowUntrusted: true,
      validate: () => {
        spin(20);
        return true;
      },
    }
  );

  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 15, `expected validation to take time, got ${elapsed}ms`);
  assert.ok(
    result.hydrated.includes("slowValidate") || result.created.includes("slowValidate"),
    "expected hydrateStores to materialize the store"
  );
  assert.deepStrictEqual(getStore("slowValidate"), { value: 1 });
});
