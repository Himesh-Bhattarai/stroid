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
  evaluateComputed,
  getComputedDescriptor,
  getStoreSnapshot as getPsrStoreSnapshot,
  getTimingContract,
  type ComputedClassification,
  type ComputedDescriptor,
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
const computedDescriptor = getComputedDescriptor("dtsSmokeComputed");
const computedClassification: ComputedClassification = "opaque";
const fallbackDescriptor: ComputedDescriptor = {
  id: "dtsSmokeComputed",
  storeId: "dtsSmokeComputed",
  path: [],
  dependencies: [],
  classification: computedClassification,
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
void computedDescriptor;
void fallbackDescriptor;
void runtimePatch;
void psrPatchResult;
void psrBatchResult;
void evaluatedComputed;
