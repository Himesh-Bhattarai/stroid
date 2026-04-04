import assert from "node:assert/strict";
import { createComputed } from "../../src/computed/index.js";
import { subscribers } from "../../src/core/store-lifecycle/registry.js";
import { createStore, deleteStore, hasStore, setStore, subscribe } from "../../src/store.js";
import { getStoreHealth, listStores } from "../../src/runtime-tools/index.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  heapMb,
  isMainModule,
  maybeGc,
  round,
} from "./benchmark-guarantee-utils.js";

const WARMUP_CYCLES = 40;
const MEASURED_CYCLES = 240;
const SUBSCRIBERS_PER_STORE = 12;
const CHECKPOINT_EVERY = 40;
const MAX_RETAINED_GROWTH_MB = 16;

let sink = 0;

const runCycle = async (cycle: number): Promise<void> => {
  const storeName = `leakSession-${cycle}`;
  const computedName = `leakDouble-${cycle}`;

  createStore(storeName, { value: cycle, history: [cycle] });
  createComputed(
    computedName,
    [storeName],
    (state) => ((state as { value?: number } | null)?.value ?? 0) * 2,
    {
      classification: "deterministic",
      autoDispose: true,
    },
  );

  const offs = [
    ...Array.from({ length: SUBSCRIBERS_PER_STORE }, (_value, index) =>
      subscribe(storeName, () => {
        sink += index & 0;
      })),
    ...Array.from({ length: SUBSCRIBERS_PER_STORE }, (_value, index) =>
      subscribe(computedName, () => {
        sink += index & 0;
      })),
  ];

  setStore(storeName, (draft: { value: number; history: number[] }) => {
    draft.value += 1;
    draft.history.push(cycle + 1);
  });
  setStore(storeName, (draft: { value: number; history: number[] }) => {
    draft.value += 1;
    draft.history.push(cycle + 2);
  });

  await flushRuntime();

  offs.forEach((off) => off());
  deleteStore(storeName);
  await flushRuntime();

  assert.equal(hasStore(storeName), false);
  assert.equal(hasStore(computedName), false);
  assert.equal(subscribers[storeName], undefined);
  assert.equal(subscribers[computedName], undefined);
};

export const runMemoryLeakBenchmark = async () => {
  if (typeof global.gc !== "function") {
    throw new Error("Run this benchmark with --expose-gc so retained-heap checks are meaningful.");
  }

  resetAllStoresForTest();

  for (let cycle = 0; cycle < WARMUP_CYCLES; cycle += 1) {
    await runCycle(cycle);
  }

  maybeGc();
  const baselineHeapMb = heapMb();
  const checkpoints: Array<{ cycle: number; heapMb: number; storeCount: number }> = [];

  for (let cycle = 0; cycle < MEASURED_CYCLES; cycle += 1) {
    await runCycle(WARMUP_CYCLES + cycle);

    if ((cycle + 1) % CHECKPOINT_EVERY === 0) {
      maybeGc();
      const stores = listStores();
      const health = getStoreHealth() as { registry: { totalStores: number } };
      assert.deepEqual(stores, []);
      assert.equal(health.registry.totalStores, 0);
      checkpoints.push({
        cycle: cycle + 1,
        heapMb: round(heapMb()),
        storeCount: stores.length,
      });
    }
  }

  maybeGc();
  const finalHeapMb = heapMb();
  const retainedGrowthMb = round(finalHeapMb - baselineHeapMb);
  const peakCheckpointHeapMb = checkpoints.length > 0
    ? Math.max(...checkpoints.map((checkpoint) => checkpoint.heapMb))
    : round(finalHeapMb);
  const peakDeltaMb = round(peakCheckpointHeapMb - baselineHeapMb);

  assert.ok(
    retainedGrowthMb <= MAX_RETAINED_GROWTH_MB,
    `Retained heap grew by ${retainedGrowthMb} MB`,
  );

  return {
    name: "Memory Leak Detection Test",
    warmupCycles: WARMUP_CYCLES,
    measuredCycles: MEASURED_CYCLES,
    subscribersPerStore: SUBSCRIBERS_PER_STORE,
    baselineHeapMb: round(baselineHeapMb),
    finalHeapMb: round(finalHeapMb),
    retainedGrowthMb,
    peakDeltaMb,
    checkpoints,
  };
};

const main = async () => {
  const result = await runMemoryLeakBenchmark();
  emitReport({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    result,
  });
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
