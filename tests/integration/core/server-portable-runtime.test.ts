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
import { configureStroid } from "../../../src/config.js";
import { runWithRegistry } from "../../../src/core/store-registry.js";
import { createStore, getStore, hasStore, setStore, subscribe } from "../../../src/store.js";

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

test("createRequestScope bind reads and writes live scoped state during run", async () => {
  const scope = createRequestScope<{
    session: { id: string; count: number; trail: string[] };
  }>({
    snapshot: {
      session: {
        id: "portable",
        count: 0,
        trail: [],
      },
    },
    options: {},
  });

  let seenCount = -1;
  const bound = scope.bind(() => {
    const current = getStore("session") as { count: number; trail: string[] };
    seenCount = current.count;
    setStore("session", (draft: { count: number; trail: string[] }) => {
      draft.count += 1;
      draft.trail.push("bound");
    });
  });

  await scope.run(async () => {
    setStore("session", (draft: { count: number }) => {
      draft.count = 7;
    });
    bound();
  });

  assert.strictEqual(seenCount, 7);
  assert.deepStrictEqual(scope.snapshot(), {
    session: {
      id: "portable",
      count: 8,
      trail: ["bound"],
    },
  });
});

test("createRequestScope bind throws outside scope.run and preserves global state", () => {
  createStore("session", { requestId: 0, revision: 0, logs: [] as string[] });

  const scope = createRequestScope<{
    session: { requestId: number; revision: number; logs: string[] };
  }>({
    snapshot: {
      session: { requestId: 2, revision: 0, logs: [] },
    },
    options: {},
  });

  const bound = scope.bind(() => {
    setStore("session", (draft: { requestId: number; revision: number }) => {
      draft.requestId = 888;
      draft.revision += 1;
    });
  });

  assert.throws(() => {
    bound();
  }, /outside scope\.run/);

  assert.deepStrictEqual(getStore("session"), { requestId: 0, revision: 0, logs: [] });
  assert.deepStrictEqual(scope.snapshot(), {
    session: { requestId: 2, revision: 0, logs: [] },
  });
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

test("portable chunked notifications keep subscriber writes inside the same request registry", async () => {
  const scope = createRequestScope<{
    portableQueueA: { v: number };
    portableQueueB: { v: number };
    portableQueueTarget: { v: number };
  }>();

  let subscriberWriteResult: ReturnType<typeof setStore> | null = null;

  runWithRegistry(scope.registry, () => {
    configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 0 } });

    createStore("portableQueueA", { v: 0 });
    createStore("portableQueueB", { v: 0 });
    createStore("portableQueueTarget", { v: 0 });

    subscribe("portableQueueA", () => {
      // Occupy first queue slot so the second store is delivered via chunk continuation.
    });
    subscribe("portableQueueB", () => {
      subscriberWriteResult = setStore("portableQueueTarget", "v", 7);
    });

    setStore("portableQueueA", "v", 1);
    setStore("portableQueueB", "v", 1);
  });

  await wait(10);

  assert.deepStrictEqual(subscriberWriteResult, { ok: true });
  assert.deepStrictEqual(scope.get("portableQueueTarget"), { v: 7 });
  assert.strictEqual(hasStore("portableQueueTarget"), false);
});
