/**
 * @module tests/integration/core/selectors-computed
 *
 * LAYER: Integration
 * OWNS:  Selector and computed graph behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearAllStores, createStore, setStore } from "../../../src/store.js";
import { subscribeWithSelector, createSelector } from "../../../src/selectors/index.js";
import {
  registerComputed,
  unregisterComputed,
  getTopoOrderedComputeds,
  getFullComputedGraph,
  getComputedDepsFor,
  getComputedDescriptor,
  getRuntimeComputedGraph,
  evaluateComputedFromSnapshot,
} from "../../../src/computed/computed-graph.js";

const parseNodeId = (nodeId: string): [string, string, Array<string | number>] =>
  JSON.parse(nodeId) as [string, string, Array<string | number>];

test("selectors handle invalid inputs and snapshot modes", async () => {
  clearAllStores();
  createStore("selStore", { nested: { value: 1 } }, { snapshot: "ref" });
  const unsub = subscribeWithSelector("selStore", null as any, Object.is, (() => {}) as any);
  unsub();

  let calls = 0;
  const unsubscribe = subscribeWithSelector(
    "selStore",
    (state) => (state as any).nested?.value,
    Object.is,
    () => { calls += 1; }
  );
  setStore("selStore", "nested.value", 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  unsubscribe();
  assert.ok(calls >= 1);

  createStore("selShallow", { nested: { value: 1 } }, { snapshot: "shallow" });
  let shallowCalls = 0;
  const shallowUnsub = subscribeWithSelector(
    "selShallow",
    (state) => (state as any).nested?.value,
    Object.is,
    () => { shallowCalls += 1; }
  );
  setStore("selShallow", "nested.value", 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  shallowUnsub();
  assert.ok(shallowCalls >= 1);

  createStore("selValue", 1 as unknown as any);
  const selector = createSelector("selValue", (state: any) => state);
  assert.strictEqual(selector(), 1);
});

test("createSelector tracks deps and skips unchanged paths in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const script = `
    import { createStore, setStore } from "./src/store.js";
    import { createSelector } from "./src/selectors/index.js";

    createStore("depStore", { nested: { value: 1 }, other: 0 }, { scope: "global" });
    const select = createSelector("depStore", (state) => {
      state[Symbol.toStringTag];
      return state.nested.value;
    });
    if (select() !== 1) throw new Error("expected initial value");
    setStore("depStore", "other", 2);
    if (select() !== 1) throw new Error("expected cached value");
    setStore("depStore", "nested.value", 3);
    if (select() !== 3) throw new Error("expected updated value");
    console.log("ok");
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: "production" },
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout ?? "", /ok/);
});

test("computed graph helpers surface deps and ordering", () => {
  registerComputed("b", ["source"], () => 1);
  registerComputed("a", ["b"], () => 1);
  registerComputed("z", ["source"], () => 1);

  const order = getTopoOrderedComputeds(["source"]);
  assert.ok(order.includes("a"));

  const graph = getFullComputedGraph();
  assert.ok(graph.nodes.includes("a"));
  const deps = getComputedDepsFor("a");
  assert.ok(deps);

  unregisterComputed("a");
  unregisterComputed("b");
  unregisterComputed("z");
});

test("computed graph descriptors and snapshot evaluation stay conservative", () => {
  registerComputed("baseDet", ["source"], (value) => (value as number) * 2, "deterministic");
  registerComputed("safeDet", ["source"], (value) => {
    if ((value as number) > 5) throw new Error("too big");
    return (value as number) * 2;
  }, "deterministic");
  registerComputed("defaultOpaque", ["source"], (value) => value);
  registerComputed("boundaryNode", ["source"], (value) => value, "asyncBoundary");

  try {
    const baseDescriptor = getComputedDescriptor("baseDet");
    const opaqueDescriptor = getComputedDescriptor("defaultOpaque");
    const boundaryDescriptor = getComputedDescriptor("boundaryNode");
    assert.ok(baseDescriptor);
    assert.ok(opaqueDescriptor);
    assert.ok(boundaryDescriptor);

    assert.deepStrictEqual(parseNodeId(baseDescriptor!.id), ["computed", "baseDet", []]);
    assert.deepStrictEqual(parseNodeId(baseDescriptor!.dependencies[0]), ["leaf", "source", []]);
    assert.deepStrictEqual(baseDescriptor, {
      id: baseDescriptor!.id,
      storeId: "baseDet",
      path: [],
      dependencies: [baseDescriptor!.dependencies[0]],
      nodeType: "computed",
      classification: "deterministic",
    });
    assert.strictEqual(getComputedDescriptor(baseDescriptor!.id)?.id, baseDescriptor!.id);
    assert.strictEqual(opaqueDescriptor?.classification, "opaque");
    assert.strictEqual(opaqueDescriptor?.nodeType, "computed");
    assert.deepStrictEqual(parseNodeId(boundaryDescriptor!.id), ["async-boundary", "boundaryNode", []]);
    assert.deepStrictEqual(boundaryDescriptor, {
      id: boundaryDescriptor!.id,
      storeId: "boundaryNode",
      path: [],
      dependencies: [boundaryDescriptor!.dependencies[0]],
      nodeType: "async-boundary",
      classification: "asyncBoundary",
      asyncBoundary: true,
    });

    const runtimeGraph = getRuntimeComputedGraph();
    assert.strictEqual(runtimeGraph.granularity, "store");
    assert.ok(runtimeGraph.nodes.some((node) =>
      node.id === baseDescriptor!.id
      && node.storeId === "baseDet"
      && node.type === "computed"
    ));
    assert.ok(runtimeGraph.nodes.some((node) =>
      node.id === baseDescriptor!.dependencies[0]
      && node.storeId === "source"
      && node.type === "leaf"
    ));
    assert.ok(runtimeGraph.edges.some((edge) =>
      edge.from === baseDescriptor!.dependencies[0]
      && edge.to === baseDescriptor!.id
      && edge.type === "leaf-input"
    ));
    assert.strictEqual(evaluateComputedFromSnapshot("baseDet", { source: 3 }), 6);
    assert.strictEqual(evaluateComputedFromSnapshot(baseDescriptor!.id, { source: 3 }), 6);
    assert.strictEqual(evaluateComputedFromSnapshot("safeDet", { source: 9, safeDet: 4 }), 4);
    assert.throws(() => evaluateComputedFromSnapshot("defaultOpaque", { source: 1 }), /deterministic/i);
    assert.throws(() => evaluateComputedFromSnapshot("missingNode", { source: 1 }), /descriptor/i);
  } finally {
    unregisterComputed("baseDet");
    unregisterComputed("safeDet");
    unregisterComputed("defaultOpaque");
    unregisterComputed("boundaryNode");
  }
});
