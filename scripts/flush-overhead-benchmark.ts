import { performance } from "node:perf_hooks";
import { clearAllStores, createStore, setStore, setStoreBatch, _subscribe } from "../src/store.js";

type BenchRow = {
  stores: number;
  subscribersPerStore: number;
  averageMs: number;
  medianMs: number;
};

const STORE_COUNTS = [1, 5, 10, 25, 50];
const SUBSCRIBER_COUNTS = [10, 100, 1000, 5000];
const RUNS = 5;

const round = (value: number): number => Number(value.toFixed(3));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

const prepare = (storesCount: number, subscribersPerStore: number) => {
  clearAllStores();
  const storeNames = Array.from({ length: storesCount }, (_, index) => `flush_${storesCount}_${index}`);

  storeNames.forEach((name) => {
    createStore(name, { value: 0 }, { scope: "global" });
  });

  const noop = () => {};
  storeNames.forEach((name) => {
    for (let i = 0; i < subscribersPerStore; i += 1) {
      _subscribe(name, noop);
    }
  });

  let expected = 0;
  let resolver: (() => void) | null = null;
  const last = storeNames[storeNames.length - 1];
  const stop = _subscribe(last, (state: any) => {
    if (!resolver || state?.value !== expected) return;
    const current = resolver;
    resolver = null;
    current();
  });

  const run = async (value: number): Promise<number> => {
    expected = value;
    const done = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    const start = performance.now();
    setStoreBatch(() => {
      storeNames.forEach((name) => {
        setStore(name, "value", value);
      });
    });
    await done;
    return performance.now() - start;
  };

  return {
    run,
    dispose: () => {
      stop();
      clearAllStores();
    },
  };
};

const main = async () => {
  const rows: BenchRow[] = [];

  for (const stores of STORE_COUNTS) {
    for (const subscribersPerStore of SUBSCRIBER_COUNTS) {
      const { run, dispose } = prepare(stores, subscribersPerStore);
      await run(1);

      const samples: number[] = [];
      for (let i = 2; i < 2 + RUNS; i += 1) {
        samples.push(await run(i));
      }

      const avg = samples.reduce((acc, value) => acc + value, 0) / samples.length;
      rows.push({
        stores,
        subscribersPerStore,
        averageMs: round(avg),
        medianMs: round(median(samples)),
      });

      dispose();
    }
  }

  const result = {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      runs: RUNS,
      notes: "Measures time from setStoreBatch() start until the final marker subscriber fires. Subscribers are no-op.",
    },
    rows,
  };

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
