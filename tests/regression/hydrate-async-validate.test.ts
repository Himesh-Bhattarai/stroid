/**
 * @module tests/regression/hydrate-async-validate
 *
 * LAYER: Regression
 * OWNS:  Guardrails around async trust validators passed to hydrateStores().
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { getStore, hydrateStores } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("hydrateStores rejects async trust validators instead of silently treating Promise as truthy", async () => {
  resetAllStoresForTest();

  const asyncValidate = (async () => {
    await Promise.resolve();
    return true;
  }) as unknown as (snapshot: { asyncValidateStore: { value: number } }) => boolean;

  let result: ReturnType<typeof hydrateStores> | null = null;
  let thrown: unknown = null;
  try {
    result = hydrateStores(
      { asyncValidateStore: { value: 1 } },
      {},
      {
        allowUntrusted: true,
        validate: asyncValidate,
      }
    );
  } catch (error) {
    thrown = error;
  }

  if (thrown) {
    assert.match(
      String((thrown as { message?: string })?.message ?? thrown),
      /trust\.validate threw|must return a boolean synchronously/i
    );
  } else {
    assert.strictEqual(result?.blocked?.reason, "validation-error");
  }
  assert.strictEqual(getStore("asyncValidateStore"), null);
});
