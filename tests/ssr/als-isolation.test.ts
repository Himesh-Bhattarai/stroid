/**
 * @module tests/ssr/als-isolation
 *
 * LAYER: SSR
 * OWNS:  AsyncLocalStorage/request-scope isolation guarantees across overlapping requests.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createStoreForRequest } from "../../src/server/index.js";
import { createRequestScope } from "../../src/server/portable.js";
import { getStore, hasStore, setStore } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

test("request-scoped values are never visible from global scope after hydrate completes", async () => {
  resetAllStoresForTest();

  const request = createStoreForRequest(({ create }) => {
    create("alsSession", { requestId: "req-0", value: 0 }, { lazy: false });
  });

  const inside = await request.hydrate(async () => {
    setStore("alsSession", "value", 11);
    await Promise.resolve();
    return getStore("alsSession");
  });

  assert.deepStrictEqual(inside, { requestId: "req-0", value: 11 });
  assert.deepStrictEqual(request.snapshot(), {
    alsSession: { requestId: "req-0", value: 11 },
  });
  assert.strictEqual(getStore("alsSession"), null);
  assert.strictEqual(hasStore("alsSession"), false);
});

test("five interleaved request scopes with the same store name stay fully isolated", async () => {
  resetAllStoresForTest();

  const contexts = Array.from({ length: 5 }, (_, index) =>
    createStoreForRequest(({ create }) => {
      create("alsSession", { requestId: `req-${index}`, value: index }, { lazy: false });
    })
  );

  const outputs = await Promise.all(
    contexts.map((context, index) =>
      context.hydrate(async () => {
        await wait((index % 3) * 5);
        setStore("alsSession", "value", index + 100);
        await wait(((index + 1) % 3) * 5);
        return getStore("alsSession");
      })
    )
  );

  outputs.forEach((snapshot, index) => {
    assert.deepStrictEqual(snapshot, { requestId: `req-${index}`, value: index + 100 });
  });

  contexts.forEach((context, index) => {
    assert.deepStrictEqual(context.snapshot(), {
      alsSession: { requestId: `req-${index}`, value: index + 100 },
    });
  });

  assert.strictEqual(getStore("alsSession"), null);
  assert.strictEqual(hasStore("alsSession"), false);
});

test("portable createRequestScope remains isolated across 10 concurrent request scopes", async () => {
  resetAllStoresForTest();

  const scopes = Array.from({ length: 10 }, (_, index) =>
    createRequestScope<{
      portableSession: { requestId: string; value: number };
    }>({
      snapshot: {
        portableSession: { requestId: `portable-${index}`, value: -1 },
      },
      options: {},
    })
  );

  const outputs = await Promise.all(
    scopes.map((scope, index) =>
      scope.run(async (api) => {
        await wait((index % 4) * 3);
        api.set("portableSession", (draft) => {
          draft.value = index;
        });
        await wait(((index + 2) % 4) * 3);
        return api.get("portableSession");
      })
    )
  );

  outputs.forEach((snapshot, index) => {
    assert.deepStrictEqual(snapshot, { requestId: `portable-${index}`, value: index });
  });
  scopes.forEach((scope, index) => {
    assert.deepStrictEqual(scope.snapshot(), {
      portableSession: { requestId: `portable-${index}`, value: index },
    });
  });

  assert.strictEqual(getStore("portableSession"), null);
  assert.strictEqual(hasStore("portableSession"), false);
});
