/**
 * @module tests/integration/core/runtime-patch
 *
 * LAYER: Integration
 * OWNS:  Canonical runtime patch lowering coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { runWithWriteContext } from "../../../src/internals/write-context.js";
import { clearAllStores } from "../../../src/runtime-admin/index.js";
import { getLastRuntimePatches } from "../../../src/core/runtime-patch.js";
import {
  createStore,
  hydrateStores,
  replaceStore,
  resetStore,
  setStore,
  setStoreBatch,
} from "../../../src/store.js";

const simplifyPatches = () =>
  getLastRuntimePatches().map((patch) => ({
    store: patch.store,
    path: [...patch.path],
    op: patch.op,
    value: patch.value,
    source: patch.meta.source,
    causedBy: patch.meta.causedBy ? [...patch.meta.causedBy] : undefined,
  }));

test("setStore path and merge writes lower into canonical runtime patches", () => {
  clearAllStores();
  createStore("patchStore", {
    profile: { name: "Ava" },
    role: "user",
  });

  runWithWriteContext({
    correlationId: "corr-1",
    traceContext: { traceId: "trace-1", spanId: "span-1" },
  }, () => {
    setStore("patchStore", "profile.name", "Kai");
  });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "patchStore",
    path: ["profile", "name"],
    op: "set",
    value: "Kai",
    source: "setStore",
    causedBy: ["corr-1", "trace-1", "span-1"],
  }]);

  setStore("patchStore", { role: "admin" });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "patchStore",
    path: [],
    op: "merge",
    value: { role: "admin" },
    source: "setStore",
    causedBy: undefined,
  }]);
});

test("middleware-altered writes fall back to a root set runtime patch", () => {
  clearAllStores();
  createStore("patchMiddleware", { value: 0 }, {
    lifecycle: {
      middleware: [
        ({ next }) => ({ value: ((next as { value: number }).value ?? 0) + 1 }),
      ],
    },
  });

  setStore("patchMiddleware", "value", 1);

  assert.deepStrictEqual(simplifyPatches(), [{
    store: "patchMiddleware",
    path: [],
    op: "set",
    value: { value: 2 },
    source: "setStore",
    causedBy: undefined,
  }]);
});

test("mutator, replaceStore, and resetStore lower to root set patches", () => {
  clearAllStores();
  createStore("patchRoot", { value: 1 });

  setStore("patchRoot", (draft: { value: number }) => {
    draft.value = 2;
  });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "patchRoot",
    path: [],
    op: "set",
    value: { value: 2 },
    source: "setStore",
    causedBy: undefined,
  }]);

  replaceStore("patchRoot", { value: 3 });
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "patchRoot",
    path: [],
    op: "set",
    value: { value: 3 },
    source: "replaceStore",
    causedBy: undefined,
  }]);

  resetStore("patchRoot");
  assert.deepStrictEqual(simplifyPatches(), [{
    store: "patchRoot",
    path: [],
    op: "set",
    value: { value: 1 },
    source: "resetStore",
    causedBy: undefined,
  }]);
});

test("batched writes record the combined runtime patch list and failed batches do not replace it", () => {
  clearAllStores();
  createStore("batchA", { value: 0 });
  createStore("batchB", { value: 0 });

  setStoreBatch(() => {
    setStore("batchA", "value", 1);
    setStore("batchB", "value", 2);
  });
  const successfulBatch = simplifyPatches();
  assert.deepStrictEqual(successfulBatch, [
    {
      store: "batchA",
      path: ["value"],
      op: "set",
      value: 1,
      source: "setStore",
      causedBy: undefined,
    },
    {
      store: "batchB",
      path: ["value"],
      op: "set",
      value: 2,
      source: "setStore",
      causedBy: undefined,
    },
  ]);

  setStoreBatch(() => {
    setStore("batchA", "value", 3);
    throw new Error("boom");
  });

  assert.deepStrictEqual(simplifyPatches(), successfulBatch);
});

test("hydrateStores records a canonical root-set patch batch", () => {
  clearAllStores();
  createStore("hydrateExisting", { value: 0 });

  hydrateStores({
    hydrateExisting: { value: 1 },
    hydrateCreated: { value: 2 },
  }, {}, { allowTrusted: true });

  assert.deepStrictEqual(simplifyPatches(), [
    {
      store: "hydrateExisting",
      path: [],
      op: "set",
      value: { value: 1 },
      source: "hydrateStores",
      causedBy: undefined,
    },
    {
      store: "hydrateCreated",
      path: [],
      op: "set",
      value: { value: 2 },
      source: "hydrateStores",
      causedBy: undefined,
    },
  ]);
});
