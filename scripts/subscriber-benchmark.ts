import { performance } from "node:perf_hooks";
import { _subscribe, clearAllStores, createStore, setStore } from "../src/store.js";

type Mode = "noop" | "compute";

type BenchRow = {
  subscribers: number;
  singleMedianMs: number;
  singleP95Ms: number;
  batch100Ms: number;
  retainedHeapDeltaMb: number;
  peakHeapDeltaMb: number;
};

type ThresholdSummary = {
  noticeableMs5: number | null;
  over10Ms: number | null;
  over50Ms: number | null;
  batch100Over1s: number | null;
  under16MsMax: number | null;
  impracticalOver100Ms: number | null;
  significantRetainedMemory: number | null;
  significantPeakMemory: number | null;
  maxTestedStable: number;
};

const COUNTS = [
  100,
  500,
  1_000,
  2_500,
  5_000,
  7_500,
  10_000,
  15_000,
  20_000,
  30_000,
  40_000,
  50_000,
  75_000,
  100_000,
  150_000,
  200_000,
];

const STORE_NAME = "subscriberBenchmark";
let sink = 0;

const round = (value: number): number => Number(value.toFixed(3));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

const p95 = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
};

const heapMb = (): number => process.memoryUsage().heapUsed / (1024 * 1024);

const maybeGc = (): void => {
  if (typeof global.gc === "function") {
    global.gc();
  }
};

const createCallback = (mode: Mode) => {
  if (mode === "noop") {
    return () => {};
  }

  return (state: any) => {
    const next = Number(state?.value ?? 0);
    const previous = sink;
    sink = next;
    if (previous !== next) {
      sink += (next & 1) === 0 ? 1 : 0;
    }
  };
};

const prepareStore = (subscriberCount: number, mode: Mode) => {
  clearAllStores();
  createStore(
    STORE_NAME,
    { value: 0 },
    {
      scope: "global",
      devtools: { historyLimit: 0 },
    },
  );

  const callback = createCallback(mode);
  for (let i = 0; i < subscriberCount; i++) {
    _subscribe(STORE_NAME, callback);
  }

  let expectedValue = 0;
  let resolver: (() => void) | null = null;
  let endTime = 0;

  const done = _subscribe(STORE_NAME, (state: any) => {
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

const firstAtOrAbove = (rows: BenchRow[], pick: (row: BenchRow) => number, threshold: number): number | null =>
  rows.find((row) => pick(row) >= threshold)?.subscribers ?? null;

const maxBelow = (rows: BenchRow[], pick: (row: BenchRow) => number, threshold: number): number | null => {
  const filtered = rows.filter((row) => pick(row) < threshold);
  return filtered.length > 0 ? filtered[filtered.length - 1].subscribers : null;
};

const summarize = (rows: BenchRow[]): ThresholdSummary => ({
  noticeableMs5: firstAtOrAbove(rows, (row) => row.singleMedianMs, 5),
  over10Ms: firstAtOrAbove(rows, (row) => row.singleMedianMs, 10),
  over50Ms: firstAtOrAbove(rows, (row) => row.singleMedianMs, 50),
  batch100Over1s: firstAtOrAbove(rows, (row) => row.batch100Ms, 1_000),
  under16MsMax: maxBelow(rows, (row) => row.singleMedianMs, 16),
  impracticalOver100Ms: firstAtOrAbove(rows, (row) => row.singleMedianMs, 100),
  significantRetainedMemory: firstAtOrAbove(
    rows,
    (row) => row.retainedHeapDeltaMb,
    8,
  ),
  significantPeakMemory: firstAtOrAbove(
    rows,
    (row) => row.peakHeapDeltaMb,
    8,
  ),
  maxTestedStable: rows[rows.length - 1]?.subscribers ?? 0,
});

const main = async () => {
  maybeGc();
  const noop = await benchmarkMode("noop");
  maybeGc();
  const compute = await benchmarkMode("compute");

  const result = {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      counts: COUNTS,
      semantics: {
        measuredLatency: "end-to-end time from setStore() call until the notification flush reaches a final marker subscriber",
        noticeableSlowdownThresholdMs: 5,
        visibleStallThresholdMs: 16,
        impracticalThresholdMs: 100,
        significantMemoryThresholdMb: 8,
      },
    },
    noop,
    compute,
    noopSummary: summarize(noop),
    computeSummary: summarize(compute),
  };

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
