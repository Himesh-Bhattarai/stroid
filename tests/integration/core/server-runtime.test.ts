/**
 * @module tests/integration/core/server-runtime
 *
 * LAYER: Integration
 * OWNS:  Server request-scoped store utilities.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createStoreForRequest, type RequestStoreApi } from "../../../src/server/index.js";
import { configureStroid } from "../../../src/config.js";
import { getStore, setStore, createStore, resetStore, deleteStore, subscribe } from "../../../src/store.js";
import { createSelector } from "../../../src/selectors/index.js";
import { getRequestCarrier } from "../../../src/core/store-registry.js";

test("createStoreForRequest throws when set is called before create", () => {
  assert.throws(() => {
    createStoreForRequest((api) => {
      api.set("missing", { value: 1 });
    });
  }, /requires create/);
});

test("createStoreForRequest supports functional updates and snapshots", () => {
  let api: RequestStoreApi | null = null;
  const ctx = createStoreForRequest((requestApi) => {
    api = requestApi;
  });
  if (!api) throw new Error("Expected request api");
  api.create("user", { name: "Ada", count: 1 });
  api.set("user", (draft: { count: number }) => {
    draft.count += 1;
  });
  const snapshot = api.get("user");
  assert.strictEqual(snapshot.count, 2);

  const all = ctx.snapshot();
  assert.strictEqual(all.user.count, 2);
  assert.strictEqual(api.snapshot().user.count, 2);
});

test("createStoreForRequest exposes api.snapshot inside the callback API", () => {
  let snapshot: ReturnType<RequestStoreApi["snapshot"]> | null = null;

  createStoreForRequest((api) => {
    api.create("user", { name: "Ada", count: 1 });
    api.set("user", (draft: { count: number }) => {
      draft.count += 1;
    });
    snapshot = api.snapshot();
  });

  assert.deepStrictEqual(snapshot, {
    user: { name: "Ada", count: 2 },
  });
});

test("createStoreForRequest isolates direct api.set payloads from later external mutation", () => {
  let api: RequestStoreApi | null = null;
  const ctx = createStoreForRequest((requestApi) => {
    api = requestApi;
    api.create("session", { user: "Init", count: 0 });
  });
  if (!api) throw new Error("Expected request api");

  const payload = { user: "A", count: 1 };
  api.set("session", payload);
  payload.count = 99;

  assert.deepStrictEqual(ctx.snapshot(), {
    session: { user: "A", count: 1 },
  });
});

test("createStoreForRequest persists async render-time writes into snapshot and later hydrate calls", async () => {
  const ctx = createStoreForRequest((api) => {
    api.create("session", { user: "A", count: 0 });
  });

  await ctx.hydrate(async () => {
    await Promise.resolve();
    setStore("session", "count", 1);
    setStore("session", "user", "B");

    assert.deepStrictEqual(getStore("session"), {
      user: "B",
      count: 1,
    });
  });

  assert.deepStrictEqual(ctx.snapshot(), {
    session: { user: "B", count: 1 },
  });

  await ctx.hydrate(() => {
    assert.deepStrictEqual(getStore("session"), {
      user: "B",
      count: 1,
    });
  });
});

test("createStoreForRequest bind reads live request state and persists bound callback writes", async () => {
  const ctx = createStoreForRequest((api) => {
    api.create("session", { requestId: 1, revision: 0, logs: [] as string[] });
  });

  const bound = ctx.bind(() => {
    const current = getStore("session") as { requestId: number; revision: number; logs: string[] };
    assert.strictEqual(current.revision, 7);
    setStore("session", (draft: { revision: number; logs: string[] }) => {
      draft.revision += 1;
      draft.logs.push("bound");
    });
  });

  await ctx.hydrate(async () => {
    setStore("session", (draft: { revision: number; logs: string[] }) => {
      draft.revision = 7;
      draft.logs.push("hydrate");
    });
    bound();
  });

  assert.deepStrictEqual(ctx.snapshot(), {
    session: { requestId: 1, revision: 8, logs: ["hydrate", "bound"] },
  });
});

test("createStoreForRequest bind throws outside request lifecycle and preserves global state", () => {
  createStore("session", { requestId: 0, revision: 0, logs: [] as string[] });

  const ctx = createStoreForRequest((api) => {
    api.create("session", { requestId: 1, revision: 0, logs: [] as string[] });
  });

  const bound = ctx.bind(() => {
    setStore("session", (draft: { requestId: number; revision: number }) => {
      draft.requestId = 777;
      draft.revision += 1;
    });
  });

  assert.throws(() => {
    bound();
  }, /outside request lifecycle/);

  assert.deepStrictEqual(getStore("session"), { requestId: 0, revision: 0, logs: [] });
  assert.deepStrictEqual(ctx.snapshot(), {
    session: { requestId: 1, revision: 0, logs: [] },
  });
});

test("createStoreForRequest bind stays on bound request during concurrent foreign hydrate", async () => {
  const requestA = createStoreForRequest((api) => {
    api.create("session", { requestId: 1, revision: 0, logs: [] as string[] });
  });
  const requestB = createStoreForRequest((api) => {
    api.create("session", { requestId: 2, revision: 0, logs: [] as string[] });
  });

  let releaseA: (() => void) | null = null;
  const aReady = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let continueA: (() => void) | null = null;
  const aContinue = new Promise<void>((resolve) => {
    continueA = resolve;
  });

  let seenRequestId = -1;
  const boundA = requestA.bind(() => {
    const current = getStore("session") as { requestId: number; revision: number; logs: string[] };
    seenRequestId = current.requestId;
    setStore("session", (draft: { revision: number; logs: string[] }) => {
      draft.revision += 1;
      draft.logs.push("bound-A");
    });
  });

  await Promise.all([
    requestA.hydrate(async () => {
      setStore("session", (draft: { logs: string[] }) => {
        draft.logs.push("A-start");
      });
      releaseA?.();
      await aContinue;
      setStore("session", (draft: { logs: string[] }) => {
        draft.logs.push("A-end");
      });
    }),
    requestB.hydrate(async () => {
      await aReady;
      setStore("session", (draft: { revision: number; logs: string[] }) => {
        draft.revision = 10;
        draft.logs.push("B-run");
      });
      boundA();
      continueA?.();
    }),
  ]);

  assert.strictEqual(seenRequestId, 1);
  assert.deepStrictEqual(requestA.snapshot(), {
    session: { requestId: 1, revision: 1, logs: ["A-start", "bound-A", "A-end"] },
  });
  assert.deepStrictEqual(requestB.snapshot(), {
    session: { requestId: 2, revision: 10, logs: ["B-run"] },
  });
});

test("createStoreForRequest bind uses active request carrier for non-ALS external callback", async () => {
  const request = createStoreForRequest((api) => {
    api.create("session", { requestId: 1, revision: 0, logs: [] as string[] });
  });

  let seenRevision = -1;
  const bound = request.bind(() => {
    const current = getStore("session") as { revision: number; logs: string[] };
    seenRevision = current.revision;
    setStore("session", (draft: { revision: number; logs: string[] }) => {
      draft.revision += 1;
      draft.logs.push("bound");
    });
  });

  const externalTimer = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try {
        bound();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 5);
  });

  await request.hydrate(async () => {
    setStore("session", (draft: { revision: number; logs: string[] }) => {
      draft.revision = 7;
      draft.logs.push("hydrate");
    });
    await externalTimer;
  });

  assert.strictEqual(seenRevision, 7);
  assert.deepStrictEqual(request.snapshot(), {
    session: { requestId: 1, revision: 8, logs: ["hydrate", "bound"] },
  });
});

test("createStoreForRequest snapshots include chunked subscriber side effects before hydrate returns", () => {
  const ctx = createStoreForRequest();

  ctx.hydrate(() => {
    configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 0 } });

    createStore("snapshotQueueA", { v: 0 });
    createStore("snapshotQueueB", { v: 0 });
    createStore("snapshotQueueTarget", { v: 0 });

    subscribe("snapshotQueueA", () => {
      // Occupy first queue slot so second store is processed via continuation.
    });
    subscribe("snapshotQueueB", () => {
      setStore("snapshotQueueTarget", "v", 9);
    });

    setStore("snapshotQueueA", "v", 1);
    setStore("snapshotQueueB", "v", 1);
  });

  assert.deepStrictEqual(ctx.snapshot(), {
    snapshotQueueA: { v: 1 },
    snapshotQueueB: { v: 1 },
    snapshotQueueTarget: { v: 9 },
  });
});

test("createStoreForRequest async hydrate waits for delayed chunked subscriber effects before snapshot sync", async () => {
  const ctx = createStoreForRequest();

  await ctx.hydrate(async () => {
    configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 5 } });

    createStore("asyncSnapshotQueueA", { v: 0 });
    createStore("asyncSnapshotQueueB", { v: 0 });
    createStore("asyncSnapshotQueueTarget", { v: 0 });

    subscribe("asyncSnapshotQueueA", () => {
      // Occupy first slot.
    });
    subscribe("asyncSnapshotQueueB", () => {
      setStore("asyncSnapshotQueueTarget", "v", 11);
    });

    setStore("asyncSnapshotQueueA", "v", 1);
    setStore("asyncSnapshotQueueB", "v", 1);
    await Promise.resolve();
  });

  assert.deepStrictEqual(ctx.snapshot(), {
    asyncSnapshotQueueA: { v: 1 },
    asyncSnapshotQueueB: { v: 1 },
    asyncSnapshotQueueTarget: { v: 11 },
  });
});

test("createSelector reads request-scoped stores during hydrate", async () => {
  const ctx = createStoreForRequest();

  await ctx.hydrate(() => {
    createStore("user", { name: "Ada", count: 1 });

    const selectName = createSelector("user", (state: { name: string } | null) => state?.name ?? null);

    assert.strictEqual(selectName(), "Ada");
  });
});

test("resetStore passes the request-scoped previous value to onReset", async () => {
  const ctx = createStoreForRequest();

  await ctx.hydrate(() => {
    let prevValue: { name: string; count: number } | undefined;

    createStore("user", { name: "Ada", count: 1 }, {
      onReset: (prev) => {
        prevValue = prev;
      },
    });

    setStore("user", "count", 2);
    resetStore("user");

    assert.deepStrictEqual(prevValue, { name: "Ada", count: 2 });
    assert.deepStrictEqual(getStore("user"), { name: "Ada", count: 1 });
  });
});

test("deleteStore passes the request-scoped previous value to onDelete", async () => {
  const ctx = createStoreForRequest();

  await ctx.hydrate(() => {
    let prevValue: { name: string; count: number } | undefined;

    createStore("user", { name: "Ada", count: 1 }, {
      onDelete: (prev) => {
        prevValue = prev;
      },
    });

    setStore("user", "count", 2);
    deleteStore("user");

    assert.deepStrictEqual(prevValue, { name: "Ada", count: 2 });
  });
});

test("deleteStore removes request-scoped values from the carrier", async () => {
  const ctx = createStoreForRequest();

  await ctx.hydrate(() => {
    createStore("session", { user: "Ada", count: 1 });
    deleteStore("session");

    assert.deepStrictEqual(ctx.snapshot(), {});
    assert.deepStrictEqual(getRequestCarrier(), {});
  });
});
