import { performance } from "node:perf_hooks";
import { _subscribe, clearAllStores, createStore, setStore, setStoreBatch } from "../src/store.js";

type ScenarioConfig = {
  name: string;
  description: string;
  mode: "concurrent" | "batch";
  subscriberLayout: readonly number[];
  waves: number;
};

type ScenarioResult = {
  scenario: string;
  description: string;
  mode: ScenarioConfig["mode"];
  stores: number;
  writesPerWave: number;
  totalSubscribers: number;
  subscribersPerStore: number[];
  waves: number;
  waveMedianMs: number;
  waveP95Ms: number;
  waveMaxMs: number;
  retainedHeapDeltaMb: number;
  peakHeapDeltaMb: number;
};

const SCENARIOS: readonly ScenarioConfig[] = [
  {
    name: "realtime-dashboard-concurrent",
    description: "Five hot stores updated in the same tick to simulate websocket fanout across dashboard shards.",
    mode: "concurrent",
    subscriberLayout: [75_000, 60_000, 50_000, 40_000, 25_000],
    waves: 5,
  },
  {
    name: "ops-dashboard-atomic-batch",
    description: "Ten related stores updated together inside one atomic batch to simulate a server-pushed dashboard refresh.",
    mode: "batch",
    subscriberLayout: [25_000, 25_000, 25_000, 25_000, 25_000, 25_000, 25_000, 25_000, 25_000, 25_000],
    waves: 5,
  },
];

let sink = 0;

const round = (value: number): number => Number(value.toFixed(3));

const maybeGc = (): void => {
  if (typeof global.gc === "function") global.gc();
};

const heapMb = (): number => process.memoryUsage().heapUsed / (1024 * 1024);

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const p95 = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
};

const createUniqueNoop = (seed: number) => (state: any) => {
  sink += ((state?.value ?? 0) & 1) ^ (seed & 0);
};

const prepareScenario = (scenario: ScenarioConfig) => {
  clearAllStores();
  const storeNames = scenario.subscriberLayout.map((_, index) => `${scenario.name}-${index}`);

  storeNames.forEach((name) => {
    createStore(name, { value: 0 }, { scope: "global" });
  });

  let seed = 0;
  scenario.subscriberLayout.forEach((subscriberCount, storeIndex) => {
    const name = storeNames[storeIndex];
    for (let index = 0; index < subscriberCount; index += 1) {
      _subscribe(name, createUniqueNoop(seed));
      seed += 1;
    }
  });

  let expectedByStore = new Map<string, number>();
  let pendingStoreNames = new Set<string>();
  let resolver: (() => void) | null = null;
  let endTime = 0;

  const markerOffs = storeNames.map((name) =>
    _subscribe(name, (state: any) => {
      if (resolver === null || !pendingStoreNames.has(name)) return;
      if (state?.value !== expectedByStore.get(name)) return;
      pendingStoreNames.delete(name);
      if (pendingStoreNames.size > 0) return;
      endTime = performance.now();
      const current = resolver;
      resolver = null;
      current();
    })
  );

  const runWave = async (waveNumber: number): Promise<number> => {
    const values = new Map(
      storeNames.map((name, index) => [name, (waveNumber * 1_000) + index + 1] as const)
    );
    expectedByStore = values;
    pendingStoreNames = new Set(storeNames);

    const completion = new Promise<void>((resolve) => {
      resolver = resolve;
    });

    const startTime = performance.now();
    if (scenario.mode === "batch") {
      setStoreBatch(() => {
        storeNames.forEach((name) => {
          setStore(name, { value: values.get(name)! });
        });
      });
    } else {
      storeNames.forEach((name) => {
        queueMicrotask(() => {
          setStore(name, { value: values.get(name)! });
        });
      });
    }

    await completion;
    return endTime - startTime;
  };

  return {
    storeNames,
    async benchmark(): Promise<ScenarioResult> {
      const totalSubscribers = scenario.subscriberLayout.reduce((sum, count) => sum + count, 0);

      await runWave(1);
      maybeGc();
      const baselineHeap = heapMb();
      let peakHeap = baselineHeap;

      const samples: number[] = [];
      for (let wave = 2; wave < scenario.waves + 2; wave += 1) {
        samples.push(await runWave(wave));
        const currentHeap = heapMb();
        if (currentHeap > peakHeap) peakHeap = currentHeap;
      }

      maybeGc();
      const retainedHeap = heapMb();

      return {
        scenario: scenario.name,
        description: scenario.description,
        mode: scenario.mode,
        stores: storeNames.length,
        writesPerWave: storeNames.length,
        totalSubscribers,
        subscribersPerStore: [...scenario.subscriberLayout],
        waves: scenario.waves,
        waveMedianMs: round(median(samples)),
        waveP95Ms: round(p95(samples)),
        waveMaxMs: round(Math.max(...samples)),
        retainedHeapDeltaMb: round(retainedHeap - baselineHeap),
        peakHeapDeltaMb: round(peakHeap - baselineHeap),
      };
    },
    dispose: () => {
      markerOffs.forEach((off) => off());
      clearAllStores();
    },
  };
};

const main = async () => {
  maybeGc();
  const results: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    const prepared = prepareScenario(scenario);
    try {
      results.push(await prepared.benchmark());
    } finally {
      prepared.dispose();
      maybeGc();
    }
  }

  process.stdout.write(`${JSON.stringify({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      totalSubscribersTarget: 250_000,
      semantics: {
        measuredLatency: "end-to-end time from write scheduling until the final marker subscriber observes the committed value",
        concurrencyModel: "same-tick queueMicrotask fanout for concurrent scenarios; setStoreBatch for atomic scenarios",
      },
    },
    results,
  }, null, 2)}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
