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
import { createStoreForRequest } from "../../../src/server/index.js";
import { getStore, setStore, createStore, resetStore, deleteStore } from "../../../src/store.js";
import { createSelector } from "../../../src/selectors/index.js";

test("createStoreForRequest throws when set is called before create", () => {
  assert.throws(() => {
    createStoreForRequest((api) => {
      api.set("missing" as any, { value: 1 } as any);
    });
  }, /requires create/);
});

test("createStoreForRequest supports functional updates and snapshots", () => {
  let api: any = null;
  const ctx = createStoreForRequest((requestApi) => {
    api = requestApi;
  });
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
  let snapshot: any = null;

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
  let api: any = null;
  const ctx = createStoreForRequest((requestApi) => {
    api = requestApi;
    api.create("session", { user: "Init", count: 0 });
  });

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
