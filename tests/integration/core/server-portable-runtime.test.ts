/**
 * @module tests/integration/core/server-portable-runtime
 *
 * LAYER: Integration
 * OWNS:  Explicit request-scope boundary coverage for portable/serverless runtimes.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStoreForRequest } from "../../../src/server/index.js";
import { createRequestScope } from "../../../src/server/portable.js";
import { createStore, getStore, hasStore, setStore } from "../../../src/store.js";

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

test("createStoreForRequest capture preserves render-created store options for portable request scopes", async () => {
  const errors: string[] = [];
  const request = createStoreForRequest();

  await request.hydrate(() => {
    createStore("portableSession", { value: 1 }, {
      validate: (candidate: unknown) =>
        typeof (candidate as { value?: unknown } | null)?.value === "number" ? candidate : false,
      onError: (message) => { errors.push(message); },
    });
    setStore("portableSession", { value: 2 });
  });

  const portable = createRequestScope(request.capture());
  let snapshot: unknown = null;

  await portable.run(async (api) => {
    await Promise.resolve();
    api.set("portableSession", { value: "bad" as unknown as number });
    snapshot = api.get("portableSession");
  });

  assert.deepStrictEqual(snapshot, { value: 2 });
  assert.ok(errors.some((message) => message.includes('Validation blocked update for "portableSession"')));
});

test("createRequestScope keeps async awaited writes isolated from the global registry", async () => {
  const scope = createRequestScope<{
    session: { id: string; count: number; trail: string[] };
  }>({
    snapshot: {
      session: {
        id: "portable",
        count: 0,
        trail: ["seed"],
      },
    },
    options: {},
  });

  const finalState = await scope.run(async (api) => {
    await Promise.resolve();
    api.set("session", (draft) => {
      draft.count += 1;
      draft.trail.push("microtask");
    });

    await wait(0);
    api.set("session", (draft) => {
      draft.count += 1;
      draft.trail.push("timer");
    });

    return api.get("session");
  });

  assert.deepStrictEqual(finalState, {
    id: "portable",
    count: 2,
    trail: ["seed", "microtask", "timer"],
  });
  assert.deepStrictEqual(scope.snapshot(), {
    session: {
      id: "portable",
      count: 2,
      trail: ["seed", "microtask", "timer"],
    },
  });
  assert.strictEqual(hasStore("session"), false);
  assert.strictEqual(getStore("session"), null);
});

test("createRequestScope isolates overlapping async scopes without async-local storage", async () => {
  const scopeA = createRequestScope<{
    session: { id: string; count: number; trail: string[] };
  }>({
    snapshot: {
      session: {
        id: "A",
        count: 0,
        trail: ["seed-A"],
      },
    },
    options: {},
  });
  const scopeB = createRequestScope<{
    session: { id: string; count: number; trail: string[] };
  }>({
    snapshot: {
      session: {
        id: "B",
        count: 10,
        trail: ["seed-B"],
      },
    },
    options: {},
  });

  const [resultA, resultB] = await Promise.all([
    scopeA.run(async (api) => {
      await Promise.resolve();
      api.set("session", (draft) => {
        draft.count += 1;
        draft.trail.push("A-microtask");
      });
      await wait(0);
      api.set("session", (draft) => {
        draft.count += 1;
        draft.trail.push("A-timer");
      });
      return api.snapshot();
    }),
    scopeB.run(async (api) => {
      api.set("session", (draft) => {
        draft.count += 5;
        draft.trail.push("B-sync");
      });
      await Promise.resolve();
      api.set("session", (draft) => {
        draft.count += 5;
        draft.trail.push("B-microtask");
      });
      return api.snapshot();
    }),
  ]);

  assert.deepStrictEqual(resultA, {
    session: {
      id: "A",
      count: 2,
      trail: ["seed-A", "A-microtask", "A-timer"],
    },
  });
  assert.deepStrictEqual(resultB, {
    session: {
      id: "B",
      count: 20,
      trail: ["seed-B", "B-sync", "B-microtask"],
    },
  });
  assert.deepStrictEqual(scopeA.snapshot(), resultA);
  assert.deepStrictEqual(scopeB.snapshot(), resultB);
  assert.strictEqual(hasStore("session"), false);
});
