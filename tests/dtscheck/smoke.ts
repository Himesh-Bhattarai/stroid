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
configureStroid({ defaultSnapshotMode: "deep" });

void value;
void metrics;
void asyncMetrics;
void health;
void hook;
