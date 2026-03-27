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
import { installPersist, installSync } from "../../../src/install.js";
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

const parseNodeId = (nodeId: string): [string, string, Array<string | number>] =>
  JSON.parse(nodeId) as [string, string, Array<string | number>];

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
  installSync();

  createStore("psrPlain", { value: 1 });
  createStore("psrAsync", { value: 1 }, {
    persist: {
      encryptAsync: async (value) => value,
      decryptAsync: async (value) => value,
    },
  });
  createStore("psrShared", { value: 1 }, {
    sync: {
      channel: "psr-timing",
      policy: "insecure",
    },
  });
  createStore("psrSource", { value: 1 });
  createComputed("psrBoundaryTiming", ["psrSource"], (value) => value, {
    classification: "asyncBoundary",
  });

  assert.deepStrictEqual(getTimingContract("psrPlain"), {
    simulationWindow: "pre-commit",
    executionModel: "sync",
    effectScope: "out-of-pipeline",
    governanceMode: "full-governor",
    mutationAuthority: "exclusive",
    causalityBoundary: "none",
    reasons: [],
  });
  assert.deepStrictEqual(getTimingContract("psrAsync"), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "in-pipeline",
    governanceMode: "bounded-governor",
    mutationAuthority: "exclusive",
    causalityBoundary: "async-boundary",
    reasons: [
      "persist for \"psrAsync\" introduces async boundary work",
    ],
  });
  assert.deepStrictEqual(getTimingContract("psrShared"), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "in-pipeline",
    governanceMode: "observer",
    mutationAuthority: "shared",
    causalityBoundary: "async-boundary",
    reasons: [
      "sync for \"psrShared\" can apply remote writes outside the local commit path",
    ],
  });
  assert.deepStrictEqual(getTimingContract("psrSource"), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "out-of-pipeline",
    governanceMode: "bounded-governor",
    mutationAuthority: "exclusive",
    causalityBoundary: "async-boundary",
    reasons: [
      "downstream computed node \"psrBoundaryTiming\" is marked asyncBoundary",
    ],
  });
  assert.deepStrictEqual(getTimingContract(), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "in-pipeline",
    governanceMode: "observer",
    mutationAuthority: "shared",
    causalityBoundary: "async-boundary",
    reasons: [
      "computed node \"psrBoundaryTiming\" is marked asyncBoundary",
      "persist for \"psrAsync\" introduces async boundary work",
      "sync for \"psrShared\" can apply remote writes outside the local commit path",
    ],
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

  const descriptor = getComputedDescriptor("psrDerived");
  assert.ok(descriptor);

  const graph = getComputedGraph();
  assert.strictEqual(graph.granularity, "store");
  assert.ok(graph.nodes.some((node) =>
    node.id === descriptor!.id
    && node.storeId === "psrDerived"
    && node.type === "computed"
    && node.path.length === 0
  ));
  assert.ok(graph.nodes.some((node) =>
    node.id === descriptor!.dependencies[0]
    && node.storeId === "psrBase"
    && node.type === "leaf"
    && node.path.length === 0
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.from === descriptor!.dependencies[0]
    && edge.to === descriptor!.id
    && edge.type === "leaf-input"
  ));
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

  const detBaseDescriptor = getComputedDescriptor("psrDetBase");
  const detTotalDescriptor = getComputedDescriptor("psrDetTotal");
  const opaqueDescriptor = getComputedDescriptor("psrOpaque");
  const boundaryDescriptor = getComputedDescriptor("psrBoundary");

  assert.ok(detBaseDescriptor);
  assert.ok(detTotalDescriptor);
  assert.ok(opaqueDescriptor);
  assert.ok(boundaryDescriptor);

  assert.deepStrictEqual(parseNodeId(detBaseDescriptor!.id), ["computed", "psrDetBase", []]);
  assert.deepStrictEqual(parseNodeId(detTotalDescriptor!.id), ["computed", "psrDetTotal", []]);
  assert.deepStrictEqual(parseNodeId(detTotalDescriptor!.dependencies[0]), ["computed", "psrDetBase", []]);
  assert.deepStrictEqual(detTotalDescriptor, {
    id: detTotalDescriptor!.id,
    storeId: "psrDetTotal",
    path: [],
    dependencies: [detBaseDescriptor!.id],
    nodeType: "computed",
    classification: "deterministic",
  });
  assert.deepStrictEqual(getComputedDescriptor(detTotalDescriptor!.id), detTotalDescriptor);
  assert.strictEqual(opaqueDescriptor?.classification, "opaque");
  assert.strictEqual(opaqueDescriptor?.nodeType, "computed");
  assert.deepStrictEqual(parseNodeId(boundaryDescriptor!.id), ["async-boundary", "psrBoundary", []]);
  assert.deepStrictEqual(parseNodeId(boundaryDescriptor!.dependencies[0]), ["leaf", "psrSource", []]);
  assert.deepStrictEqual(boundaryDescriptor, {
    id: boundaryDescriptor!.id,
    storeId: "psrBoundary",
    path: [],
    dependencies: [boundaryDescriptor!.dependencies[0]],
    nodeType: "async-boundary",
    classification: "asyncBoundary",
    asyncBoundary: true,
  });

  assert.strictEqual(evaluateComputed(detTotalDescriptor!.id, {
    psrSource: { value: 7 },
    psrDetBase: 2,
    psrDetTotal: 3,
  }), 8);
  assert.throws(() => evaluateComputed(opaqueDescriptor!.id, {
    psrSource: { value: 7 },
    psrOpaque: 12,
  }), /deterministic/i);
  assert.throws(() => evaluateComputed(boundaryDescriptor!.id, {
    psrSource: { value: 7 },
    psrBoundary: { value: 7 },
  }), /deterministic/i);
});
