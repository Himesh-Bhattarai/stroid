/**
 * @module tests/dtscheck/smoke
 *
 * LAYER: Tests
 * OWNS:  Smoke checks for built .d.ts resolution.
 *
 * Consumers: tsc --noEmit (tsconfig.dtscheck.json)
 */
import { createStoreStrict, setStore, getStore, configureStroid, store } from "stroid";
import { createStore as createCoreStore } from "stroid/core";
import { getMetrics, getAsyncMetrics, getStoreHealth } from "stroid";
import {
  applyStorePatch,
  applyStorePatchesAtomic,
  type CausalityBoundary,
  evaluateComputed,
  type GovernanceMode,
  getComputedGraph,
  getComputedDescriptor,
  getStoreSnapshot as getPsrStoreSnapshot,
  getTimingContract,
  type MutationAuthority,
  type ComputedClassification,
  type ComputedDescriptor,
  type RuntimeGraph,
  type RuntimeGraphEdge,
  type RuntimeGraphNode,
  type RuntimePatch,
} from "stroid/psr";
import { useStore } from "stroid/react";

const handle = createStoreStrict("dtsSmoke", { value: 1 });
setStore(handle, { value: 2 });
const value = getStore(handle);
const metrics = getMetrics("dtsSmoke");
const asyncMetrics = getAsyncMetrics();
const health = getStoreHealth("dtsSmoke");
const core = createCoreStore("dtsSmokeCore", { value: 1 });
const coreHandle = core ?? store("dtsSmokeCore");
const hook = useStore(coreHandle);
const psrSnapshot = getPsrStoreSnapshot(handle);
const timingContract = getTimingContract(handle);
const governanceMode: GovernanceMode = "full-governor";
const mutationAuthority: MutationAuthority = "exclusive";
const causalityBoundary: CausalityBoundary = "none";
const runtimeGraph = getComputedGraph();
const computedDescriptor = getComputedDescriptor("dtsSmokeComputed");
const computedClassification: ComputedClassification = "opaque";
const fallbackDescriptor: ComputedDescriptor = {
  id: "dtsSmokeComputed",
  storeId: "dtsSmokeComputed",
  path: [],
  dependencies: [],
  nodeType: "computed",
  classification: computedClassification,
};
const runtimeGraphNode: RuntimeGraphNode = {
  id: "[\"leaf\",\"dtsSmoke\",[]]",
  storeId: "dtsSmoke",
  path: [],
  type: "leaf",
};
const runtimeGraphEdge: RuntimeGraphEdge = {
  from: runtimeGraphNode.id,
  to: "[\"computed\",\"dtsSmokeComputed\",[]]",
  type: "leaf-input",
};
const fallbackGraph: RuntimeGraph = {
  granularity: "store",
  nodes: [runtimeGraphNode],
  edges: [runtimeGraphEdge],
};
const runtimePatch: RuntimePatch = {
  id: "smoke-patch",
  store: "dtsSmoke",
  path: [],
  op: "set",
  meta: {
    timestamp: 1,
    source: "setStore",
  },
};
const psrPatchResult = applyStorePatch(runtimePatch);
const psrBatchResult = applyStorePatchesAtomic([runtimePatch]);
const evaluatedComputed = evaluateComputed("dtsSmokeComputed", { dtsSmoke: { value: 2 } });
configureStroid({ defaultSnapshotMode: "deep" });

void value;
void metrics;
void asyncMetrics;
void health;
void hook;
void psrSnapshot;
void timingContract;
void governanceMode;
void mutationAuthority;
void causalityBoundary;
void runtimeGraph;
void computedDescriptor;
void fallbackDescriptor;
void fallbackGraph;
void runtimePatch;
void psrPatchResult;
void psrBatchResult;
void evaluatedComputed;
