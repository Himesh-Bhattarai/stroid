import { performance } from "node:perf_hooks";
import { createStore, setStore } from "../src/core/index.js";
import { clearAllStores } from "../src/core/store-admin.js";
import { subscribeStore } from "../src/core/store-notify.js";

type Mode = "noop" | "compute";

type BenchRow = {
  subscribers: number;
  singleMedianMs: number;
  singleP95Ms: number;
  batch100Ms: number;
  retainedHeapDeltaMb: number;
  peakHeapDeltaMb: number;
};

type StoreSnapshot = { value?: number } | null;

const COUNTS = [100, 500, 1_000, 2_500, 5_000, 7_500, 10_000];
const STORE_NAME = "coreSmallBenchmark";
let sink = 0;

const round = (value: number): number => Number(value.toFixed(3));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const p95 = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
};

const maybeGc = (): void => {
  if (typeof global.gc === "function") global.gc();
};

const heapMb = (): number => process.memoryUsage().heapUsed / (1024 * 1024);

const createCallback = (mode: Mode) => {
  if (mode === "noop") return (_state: StoreSnapshot) => {};

  return (state: StoreSnapshot) => {
    const next = Number(state?.value ?? 0);
    const previous = sink;
    sink = next;
    if (previous !== next) {
      sink += (next & 1) === 0 ? 1 : 0;
    }
  };
};

const createUniqueCallback = (mode: Mode, index: number) => {
  const callback = createCallback(mode);
  return (state: StoreSnapshot) => {
    sink += index & 0;
    callback(state);
  };
};

const prepareStore = (subscriberCount: number, mode: Mode) => {
  clearAllStores();
  createStore(STORE_NAME, { value: 0 }, { scope: "global" });

  for (let i = 0; i < subscriberCount; i++) {
    subscribeStore(STORE_NAME, createUniqueCallback(mode, i));
  }

  let expectedValue = 0;
  let resolver: (() => void) | null = null;
  let endTime = 0;

  const done = subscribeStore(STORE_NAME, (state: StoreSnapshot) => {
    if (state?.value !== expectedValue || resolver === null) return;
    endTime = performance.now();
    const current = resolver;
    resolver = null;
    current();
  });

  const updateAndWait = async (value: number): Promise<number> => {
    expectedValue = value;
    const completion = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    const startTime = performance.now();
    setStore(STORE_NAME, { value });
    await completion;
    return endTime - startTime;
  };

  return {
    updateAndWait,
    dispose: () => {
      done();
      clearAllStores();
    },
  };
};

const benchmarkMode = async (mode: Mode): Promise<BenchRow[]> => {
  const rows: BenchRow[] = [];

  for (const subscribers of COUNTS) {
    const { updateAndWait, dispose } = prepareStore(subscribers, mode);

    await updateAndWait(1);
    maybeGc();
    const baselineHeap = heapMb();

    const singleRuns: number[] = [];
    for (let i = 2; i <= 6; i++) {
      singleRuns.push(await updateAndWait(i));
    }

    let peakHeap = baselineHeap;
    const batchStart = performance.now();
    for (let i = 7; i < 107; i++) {
      await updateAndWait(i);
      const currentHeap = heapMb();
      if (currentHeap > peakHeap) peakHeap = currentHeap;
    }
    const batch100Ms = performance.now() - batchStart;

    maybeGc();
    const afterHeap = heapMb();

    rows.push({
      subscribers,
      singleMedianMs: round(median(singleRuns)),
      singleP95Ms: round(p95(singleRuns)),
      batch100Ms: round(batch100Ms),
      retainedHeapDeltaMb: round(afterHeap - baselineHeap),
      peakHeapDeltaMb: round(peakHeap - baselineHeap),
    });

    dispose();
    maybeGc();
  }

  return rows;
};

const main = async () => {
  maybeGc();
  const noop = await benchmarkMode("noop");
  maybeGc();
  const compute = await benchmarkMode("compute");

  console.log(
    JSON.stringify(
      {
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          counts: COUNTS,
          semantics:
            "end-to-end time from setStore() until the final marker subscriber runs",
          target: "stroid/core",
        },
        noop,
        compute,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
