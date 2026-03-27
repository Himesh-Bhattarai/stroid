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
