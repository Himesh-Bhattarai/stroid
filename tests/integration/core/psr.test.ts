/**
 * @module tests/integration/core/psr
 *
 * LAYER: Integration
 * OWNS:  Native PSR entrypoint coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { installPersist } from "../../../src/install.js";
import { createComputed } from "../../../src/computed/index.js";
import { clearAllStores } from "../../../src/runtime-admin/index.js";
import { getStoreMeta } from "../../../src/runtime-tools/index.js";
import { createStore, setStore, setStoreBatch, store } from "../../../src/store.js";
import {
  getComputedGraph,
  getComputedDescriptor,
  getStoreSnapshot,
  getStoreSnapshotNoTrack,
  getTimingContract,
  hasStore,
  listStores,
  subscribeStore,
  evaluateComputed,
} from "../../../src/psr/index.js";

test("psr snapshots stay no-track and committed-only", () => {
  clearAllStores();
  createStore("psrRead", { value: 0 });

  let insideBatchSnapshot: unknown = null;
  setStoreBatch(() => {
    setStore("psrRead", "value", 1);
    insideBatchSnapshot = getStoreSnapshot("psrRead");
  });

  const handle = store("psrRead");
  const before = getStoreMeta("psrRead");
  assert.strictEqual(before?.readCount, 0);
  assert.deepStrictEqual(insideBatchSnapshot, { value: 0 });
  assert.deepStrictEqual(getStoreSnapshot(handle), { value: 1 });
  assert.deepStrictEqual(getStoreSnapshotNoTrack("psrRead"), { value: 1 });

  const after = getStoreMeta("psrRead");
  assert.strictEqual(after?.readCount, 0);
});

test("psr subscriptions fire after commit with the final batched snapshot", async () => {
  clearAllStores();
  createStore("psrBatch", { value: 0 });

  const seen: number[] = [];
  const off = subscribeStore(store("psrBatch"), (snapshot) => {
    seen.push((snapshot as { value: number } | null)?.value ?? -1);
  });

  setStoreBatch(() => {
    setStore("psrBatch", "value", 1);
    setStore("psrBatch", "value", 2);
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  off();

  assert.deepStrictEqual(seen, [2]);
});

test("psr timing contract reflects runtime sync vs async boundaries", () => {
  clearAllStores();
  installPersist();

  createStore("psrSync", { value: 1 });
  createStore("psrAsync", { value: 1 }, {
    persist: {
      encryptAsync: async (value) => value,
      decryptAsync: async (value) => value,
    },
  });

  assert.deepStrictEqual(getTimingContract("psrSync"), {
    simulationWindow: "pre-commit",
    executionModel: "sync",
    effectScope: "out-of-pipeline",
  });
  assert.deepStrictEqual(getTimingContract("psrAsync"), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "in-pipeline",
  });
  assert.deepStrictEqual(getTimingContract(), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "in-pipeline",
  });
});

test("psr entrypoint re-exports list/has/meta graph-safe observation helpers", () => {
  clearAllStores();
  createStore("psrBase", { value: 2 });
  createComputed("psrDerived", ["psrBase"], (base) => ({
    value: (base as { value?: number } | null)?.value ?? 0,
  }));

  assert.strictEqual(hasStore(store("psrBase")), true);
  assert.ok(listStores().includes("psrBase"));

  const graph = getComputedGraph();
  assert.ok(graph.nodes.includes("psrDerived"));
  assert.ok(graph.edges.some((edge) => edge.from === "psrBase" && edge.to === "psrDerived"));
});

test("psr computed descriptors expose safe simulation boundaries", () => {
  clearAllStores();
  createStore("psrSource", { value: 2 });

  createComputed("psrDetBase", ["psrSource"], (base) => (
    (base as { value?: number } | null)?.value ?? 0
  ), {
    classification: "deterministic",
  });
  createComputed("psrDetTotal", ["psrDetBase"], (value) => (
    ((value as number | null) ?? 0) + 1
  ), {
    classification: "deterministic",
  });

  let externalOffset = 5;
  createComputed("psrOpaque", ["psrSource"], (base) => (
    ((base as { value?: number } | null)?.value ?? 0) + externalOffset
  ));

  createComputed("psrBoundary", ["psrSource"], (base) => ({
    value: (base as { value?: number } | null)?.value ?? 0,
  }), {
    classification: "asyncBoundary",
  });

  assert.deepStrictEqual(getComputedDescriptor("psrDetTotal"), {
    id: "psrDetTotal",
    storeId: "psrDetTotal",
    path: [],
    dependencies: ["psrDetBase"],
    classification: "deterministic",
  });
  assert.strictEqual(getComputedDescriptor("psrOpaque")?.classification, "opaque");
  assert.deepStrictEqual(getComputedDescriptor("psrBoundary"), {
    id: "psrBoundary",
    storeId: "psrBoundary",
    path: [],
    dependencies: ["psrSource"],
    classification: "asyncBoundary",
    asyncBoundary: true,
  });

  assert.strictEqual(evaluateComputed("psrDetTotal", {
    psrSource: { value: 7 },
    psrDetBase: 2,
    psrDetTotal: 3,
  }), 8);
  assert.throws(() => evaluateComputed("psrOpaque", {
    psrSource: { value: 7 },
    psrOpaque: 12,
  }), /deterministic/i);
  assert.throws(() => evaluateComputed("psrBoundary", {
    psrSource: { value: 7 },
    psrBoundary: { value: 7 },
  }), /deterministic/i);
});
