/**
 * @module tests/integration/core/psr-patch
 *
 * LAYER: Integration
 * OWNS:  Native PSR patch-apply contract coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores } from "../../../src/runtime-admin/index.js";
import { getLastRuntimePatches } from "../../../src/core/runtime-patch.js";
import { createStore, getStore } from "../../../src/store.js";
import { registerNotifyHandler } from "../../../src/core/store-shared/notify.js";
import { notify as defaultNotify } from "../../../src/core/store-notify.js";
import {
  applyStorePatch,
  applyStorePatchesAtomic,
  subscribeStore,
  type RuntimePatch,
} from "../../../src/psr/index.js";

const simplifyPatches = () =>
  getLastRuntimePatches().map((patch) => ({
    store: patch.store,
    path: [...patch.path],
    op: patch.op,
    value: patch.value,
    source: patch.meta.source,
  }));

const patch = (input: Partial<RuntimePatch> & Pick<RuntimePatch, "id" | "store" | "path" | "op" | "meta">): RuntimePatch => ({
  ...input,
});

test("applyStorePatch routes serializable set and merge patches through the runtime write path", () => {
  clearAllStores();
  createStore("psrPatch", {
    profile: { name: "Ava" },
    role: "user",
  });

  assert.deepStrictEqual(applyStorePatch(patch({
    id: "psr-merge",
    store: "psrPatch",
    path: [],
    op: "merge",
    value: { role: "admin" },
    meta: {
      timestamp: 1,
      source: "setStore",
    },
  })), { ok: true });
  assert.deepStrictEqual(getStore("psrPatch"), {
    profile: { name: "Ava" },
    role: "admin",
  });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "psrPatch",
    path: [],
    op: "merge",
    value: { role: "admin" },
    source: "setStore",
  }]);

  assert.deepStrictEqual(applyStorePatch(patch({
    id: "psr-path-set",
    store: "psrPatch",
    path: ["profile", "name"],
    op: "set",
    value: "Kai",
    meta: {
      timestamp: 2,
      source: "setStore",
    },
  })), { ok: true });
  assert.deepStrictEqual(getStore("psrPatch"), {
    profile: { name: "Kai" },
    role: "admin",
  });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "psrPatch",
    path: ["profile", "name"],
    op: "set",
    value: "Kai",
    source: "setStore",
  }]);

  assert.deepStrictEqual(applyStorePatch(patch({
    id: "psr-root-set",
    store: "psrPatch",
    path: [],
    op: "set",
    value: {
      profile: { name: "Noor" },
      role: "owner",
    },
    meta: {
      timestamp: 3,
      source: "replaceStore",
    },
  })), { ok: true });
  assert.deepStrictEqual(getStore("psrPatch"), {
    profile: { name: "Noor" },
    role: "owner",
  });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "psrPatch",
    path: [],
    op: "set",
    value: {
      profile: { name: "Noor" },
      role: "owner",
    },
    source: "replaceStore",
  }]);
});

test("applyStorePatch still records the actual committed runtime patch when middleware changes the write", () => {
  clearAllStores();
  createStore("psrPatchMiddleware", { value: 0 }, {
    lifecycle: {
      middleware: [
        ({ next }) => ({ value: ((next as { value: number }).value ?? 0) + 1 }),
      ],
    },
  });

  assert.deepStrictEqual(applyStorePatch(patch({
    id: "psr-middleware",
    store: "psrPatchMiddleware",
    path: ["value"],
    op: "set",
    value: 1,
    meta: {
      timestamp: 4,
      source: "setStore",
    },
  })), { ok: true });

  assert.deepStrictEqual(getStore("psrPatchMiddleware"), { value: 2 });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "psrPatchMiddleware",
    path: [],
    op: "set",
    value: { value: 2 },
    source: "setStore",
  }]);
});

test("applyStorePatch rejects unsupported patch forms", () => {
  clearAllStores();
  createStore("psrUnsupported", { items: [1, 2, 3] });

  assert.deepStrictEqual(applyStorePatch(patch({
    id: "psr-delete",
    store: "psrUnsupported",
    path: ["items", 1],
    op: "delete",
    meta: {
      timestamp: 5,
      source: "setStore",
    },
  })), { ok: false, reason: "unsupported-op" });

  assert.deepStrictEqual(applyStorePatch(patch({
    id: "psr-nested-merge",
    store: "psrUnsupported",
    path: ["items"],
    op: "merge",
    value: [9],
    meta: {
      timestamp: 6,
      source: "setStore",
    },
  })), { ok: false, reason: "unsupported-path-shape" });

  assert.deepStrictEqual(getStore("psrUnsupported"), { items: [1, 2, 3] });
});

test("applyStorePatchesAtomic commits patch batches together and rolls back staged writes on failure", () => {
  clearAllStores();
  createStore("psrBatchA", { value: 0 });
  createStore("psrBatchB", { value: 0 });

  assert.deepStrictEqual(applyStorePatchesAtomic([
    patch({
      id: "psr-batch-a",
      store: "psrBatchA",
      path: ["value"],
      op: "set",
      value: 1,
      meta: {
        timestamp: 7,
        source: "setStore",
      },
    }),
    patch({
      id: "psr-batch-b",
      store: "psrBatchB",
      path: [],
      op: "set",
      value: { value: 2 },
      meta: {
        timestamp: 8,
        source: "replaceStore",
      },
    }),
  ]), { ok: true });

  assert.deepStrictEqual(getStore("psrBatchA"), { value: 1 });
  assert.deepStrictEqual(getStore("psrBatchB"), { value: 2 });
  assert.deepStrictEqual(simplifyPatches(), [
    {
      store: "psrBatchA",
      path: ["value"],
      op: "set",
      value: 1,
      source: "setStore",
    },
    {
      store: "psrBatchB",
      path: [],
      op: "set",
      value: { value: 2 },
      source: "replaceStore",
    },
  ]);

  const successfulBatch = simplifyPatches();
  assert.deepStrictEqual(applyStorePatchesAtomic([
    patch({
      id: "psr-batch-good",
      store: "psrBatchA",
      path: ["value"],
      op: "set",
      value: 3,
      meta: {
        timestamp: 9,
        source: "setStore",
      },
    }),
    patch({
      id: "psr-batch-bad",
      store: "psrBatchA",
      path: ["missing"],
      op: "set",
      value: 4,
      meta: {
        timestamp: 10,
        source: "setStore",
      },
    }),
  ]), { ok: false, reason: "path" });

  assert.deepStrictEqual(getStore("psrBatchA"), { value: 1 });
  assert.deepStrictEqual(getStore("psrBatchB"), { value: 2 });
  assert.deepStrictEqual(simplifyPatches(), successfulBatch);
});

test("applyStorePatchesAtomic rolls back commit-phase failures before subscribers see partial state", async () => {
  clearAllStores();
  createStore("psrAtomicA", { value: 0 });
  createStore("psrAtomicB", { value: 0 });

  const seen: number[] = [];
  const off = subscribeStore("psrAtomicA", (snapshot) => {
    seen.push((snapshot as { value: number } | null)?.value ?? -1);
  });

  registerNotifyHandler((name) => {
    if (name === "psrAtomicB") {
      throw new Error("notify boom");
    }
    defaultNotify(name);
  });

  try {
    assert.deepStrictEqual(applyStorePatchesAtomic([
      patch({
        id: "psr-atomic-a",
        store: "psrAtomicA",
        path: ["value"],
        op: "set",
        value: 1,
        meta: {
          timestamp: 11,
          source: "setStore",
        },
      }),
      patch({
        id: "psr-atomic-b",
        store: "psrAtomicB",
        path: ["value"],
        op: "set",
        value: 2,
        meta: {
          timestamp: 12,
          source: "setStore",
        },
      }),
    ]), { ok: false, reason: "validate" });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepStrictEqual(getStore("psrAtomicA"), { value: 0 });
    assert.deepStrictEqual(getStore("psrAtomicB"), { value: 0 });
    assert.deepStrictEqual(seen, []);
  } finally {
    off();
    registerNotifyHandler(defaultNotify);
  }
});
