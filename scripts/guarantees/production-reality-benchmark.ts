/**
 * Production reality benchmark suite.
 *
 * WHAT: Adds advanced benchmark tracks for real-world workload gaps:
 * - devtools write overhead at scale
 * - computed chain depth propagation cost
 * - long-session memory retention trends
 * - persist failure-mode stress (quota/race/eviction)
 * - query-cache co-load pressure and frame-budget risk signals
 * WHY: Raw micro-bench throughput alone misses production behavior that users actually feel.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import {
  createStore,
  deleteStore,
  getStore,
  replaceStore,
  setStore,
  subscribe,
} from "../../src/store.js";
import {
  createComputed,
  deleteComputed,
} from "../../src/computed/index.js";
import { installDevtools } from "../../src/devtools/index.js";
import { installPersist } from "../../src/persist.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  heapMb,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
  wait,
} from "./benchmark-guarantee-utils.js";

type Marker = {
  update: (value: number, runWrite: () => void) => Promise<number>;
  dispose: () => void;
};

type FrameBudgetSignals = {
  samples: number;
  over16Ms: number;
  over50Ms: number;
  over16Ratio: number;
  over50Ratio: number;
};

type EventLoopSignals = {
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

type DevtoolsScenario = {
  mode: "disabled" | "enabled-history-50" | "enabled-history-500";
  writes: number;
  subscribers: number;
  timing: ReturnType<typeof summarizeSamples>;
  frameBudget: FrameBudgetSignals;
  eventLoop: EventLoopSignals;
  heapDeltaMb: number;
};

type ComputedDepthScenario = {
  depth: number;
  updates: number;
  timing: ReturnType<typeof summarizeSamples>;
  frameBudget: FrameBudgetSignals;
  eventLoop: EventLoopSignals;
  valueMismatchCount: number;
};

type MemoryCheckpoint = {
  cycle: number;
  heapMb: number;
  deltaMb: number;
};

type LongSessionMemoryResult = {
  cycles: number;
  batchSize: number;
  sampleEvery: number;
  baselineHeapMb: number;
  finalHeapMb: number;
  retainedGrowthMb: number;
  peakDeltaMb: number;
  slopeMbPer1kCycles: number;
  monotonicIncreaseCount: number;
  timing: ReturnType<typeof summarizeSamples>;
  checkpoints: MemoryCheckpoint[];
};

type PersistFailureModeResult = {
  writes: number;
  quotaMode: {
    writeTiming: ReturnType<typeof summarizeSamples>;
    onErrorCount: number;
    quotaHitCount: number;
    lastPersistedLength: number;
  };
  asyncRaceMode: {
    writeTiming: ReturnType<typeof summarizeSamples>;
    lastRequestedVersion: number;
    persistedVersion: number | null;
    consistencyViolations: number;
  };
  evictionMode: {
    cycles: number;
    recoveries: number;
    failures: number;
  };
};

type QueryCoLoadScenario = {
  mode: "stroid-only" | "stroid-plus-query-cache";
  iterations: number;
  storeSubscribers: number;
  cacheSubscribers: number;
  timing: ReturnType<typeof summarizeSamples>;
  frameBudget: FrameBudgetSignals;
  eventLoop: EventLoopSignals;
  opsPerSec: number;
};

type ProductionRealityResult = {
  name: string;
  baselineOrigin: {
    generatedAt: string;
    node: string;
    platform: string;
    arch: string;
    cpuModel: string;
    cpuCount: number;
    totalMemMb: number;
    freeMemMb: number;
    loadAvg: number[];
  };
  devtoolsOverhead: {
    scenarios: DevtoolsScenario[];
    ratios: Record<string, number>;
  };
  computedChainDepth: {
    scenarios: ComputedDepthScenario[];
  };
  queryCoLoad: {
    scenarios: QueryCoLoadScenario[];
    ratioVsStroidOnly: number;
  };
  persistFailureModes: PersistFailureModeResult;
  longSessionMemory: LongSessionMemoryResult;
  userPerceived: {
    aggregateFrameBudget: FrameBudgetSignals;
    worstEventLoopP95Ms: number;
    worstEventLoopP99Ms: number;
  };
};

type QueryCacheListener = (args: { key: string; value: unknown }) => void;

const DEVTOOLS_WRITES = Number(process.env.STROID_ADV_DEVTOOLS_WRITES ?? 600);
const DEVTOOLS_SUBSCRIBERS = Number(process.env.STROID_ADV_DEVTOOLS_SUBSCRIBERS ?? 20_000);
const COMPUTED_UPDATES = Number(process.env.STROID_ADV_COMPUTED_UPDATES ?? 500);
const COMPUTED_DEPTHS = [1, 3, 5, 10];
const SESSION_CYCLES = Number(process.env.STROID_ADV_SESSION_CYCLES ?? 3_000);
const SESSION_BATCH_SIZE = Number(process.env.STROID_ADV_SESSION_BATCH_SIZE ?? 100);
const SESSION_SAMPLE_EVERY = Number(process.env.STROID_ADV_SESSION_SAMPLE_EVERY ?? 250);
const PERSIST_WRITES = Number(process.env.STROID_ADV_PERSIST_WRITES ?? 220);
const QUERY_ITERATIONS = Number(process.env.STROID_ADV_QUERY_ITERATIONS ?? 700);
const QUERY_STORE_SUBSCRIBERS = Number(process.env.STROID_ADV_QUERY_STORE_SUBSCRIBERS ?? 12_000);
const QUERY_CACHE_SUBSCRIBERS = Number(process.env.STROID_ADV_QUERY_CACHE_SUBSCRIBERS ?? 12_000);

let sink = 0;

const createMarker = (name: string, readValue: (state: unknown) => number | undefined): Marker => {
  let expectedValue = 0;
  let resolver: (() => void) | null = null;
  let endTime = 0;
  const off = subscribe(name, (snapshot) => {
    const next = readValue(snapshot);
    if (next !== expectedValue || resolver === null) return;
    endTime = performance.now();
    const done = resolver;
    resolver = null;
    done();
  });

  return {
    async update(value: number, runWrite: () => void): Promise<number> {
      expectedValue = value;
      const completion = new Promise<void>((resolve) => {
        resolver = resolve;
      });
      const startedAt = performance.now();
      runWrite();
      await completion;
      return round(endTime - startedAt);
    },
    dispose: () => {
      off();
    },
  };
};

const createUniqueNoop = (seed: number) => (_state: unknown): void => {
  sink += seed & 0;
};

const toFrameBudgetSignals = (samples: number[]): FrameBudgetSignals => {
  const over16Ms = samples.filter((value) => value > 16).length;
  const over50Ms = samples.filter((value) => value > 50).length;
  const count = samples.length;
  return {
    samples: count,
    over16Ms,
    over50Ms,
    over16Ratio: count === 0 ? 0 : round(over16Ms / count),
    over50Ratio: count === 0 ? 0 : round(over50Ms / count),
  };
};

const toEventLoopSignals = (histogram: ReturnType<typeof monitorEventLoopDelay>): EventLoopSignals => ({
  p95Ms: round(histogram.percentile(95) / 1_000_000),
  p99Ms: round(histogram.percentile(99) / 1_000_000),
  maxMs: round(histogram.max / 1_000_000),
});

const linearRegressionSlopeMbPer1k = (points: MemoryCheckpoint[]): number => {
  if (points.length < 2) return 0;
  const xs = points.map((point) => point.cycle / 1000);
  const ys = points.map((point) => point.deltaMb);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - meanX;
    numerator += dx * (ys[index]! - meanY);
    denominator += dx * dx;
  }

  return denominator === 0 ? 0 : round(numerator / denominator);
};

const countMonotonicIncreases = (points: MemoryCheckpoint[]): number => {
  let increases = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const current = points[index]!;
    if ((current.deltaMb - prev.deltaMb) > 0.05) {
      increases += 1;
    }
  }
  return increases;
};

const runDevtoolsScenario = async (
  mode: DevtoolsScenario["mode"],
): Promise<DevtoolsScenario> => {
  resetAllStoresForTest();
  maybeGc();
  const beforeHeap = heapMb();
  const storeName = `adv.devtools.${mode}`;

  const devtoolsOption = mode === "disabled"
    ? false
    : {
      historyLimit: mode === "enabled-history-50" ? 50 : 500,
    };

  createStore(storeName, { value: 0, meta: { run: 0 } }, {
    scope: "global",
    devtools: devtoolsOption,
  });

  for (let index = 0; index < DEVTOOLS_SUBSCRIBERS; index += 1) {
    subscribe(storeName, createUniqueNoop(index));
  }

  const marker = createMarker(
    storeName,
    (state) => (state && typeof state === "object" && "value" in state)
      ? (state as { value: number }).value
      : undefined,
  );

  await marker.update(1, () => {
    setStore(storeName, { value: 1, meta: { run: 1 } });
  });

  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const samples: number[] = [];

  for (let iteration = 0; iteration < DEVTOOLS_WRITES; iteration += 1) {
    const nextValue = iteration + 2;
    samples.push(await marker.update(nextValue, () => {
      setStore(storeName, {
        value: nextValue,
        meta: { run: nextValue, stable: nextValue % 2 === 0 },
      });
    }));
    if ((iteration + 1) % 100 === 0) {
      await wait(0);
    }
  }

  histogram.disable();
  marker.dispose();
  maybeGc();
  const afterHeap = heapMb();
  resetAllStoresForTest();

  return {
    mode,
    writes: DEVTOOLS_WRITES,
    subscribers: DEVTOOLS_SUBSCRIBERS,
    timing: summarizeSamples(samples),
    frameBudget: toFrameBudgetSignals(samples),
    eventLoop: toEventLoopSignals(histogram),
    heapDeltaMb: round(afterHeap - beforeHeap),
  };
};

const runComputedDepthScenario = async (depth: number): Promise<ComputedDepthScenario> => {
  resetAllStoresForTest();
  const baseName = `adv.computed.base.${depth}`;
  createStore(baseName, 0, { scope: "global", devtools: false });

  const createdNames: string[] = [];
  for (let level = 1; level <= depth; level += 1) {
    const dep = level === 1 ? baseName : `${baseName}.level.${level - 1}`;
    const computedName = `${baseName}.level.${level}`;
    const handle = createComputed(
      computedName,
      [dep],
      (value) => (typeof value === "number" ? value : 0) + 1,
      {
        classification: "deterministic",
        autoDispose: true,
      },
    );
    if (!handle) {
      throw new Error(`Failed to create computed chain at depth ${depth} (level ${level})`);
    }
    createdNames.push(computedName);
  }

  const leafName = createdNames[createdNames.length - 1]!;
  const marker = createMarker(
    leafName,
    (state) => (typeof state === "number" ? state : undefined),
  );

  await marker.update(depth + 1, () => {
    replaceStore(baseName, 1);
  });

  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const samples: number[] = [];
  let mismatchCount = 0;

  for (let iteration = 0; iteration < COMPUTED_UPDATES; iteration += 1) {
    const nextBaseValue = iteration + 2;
    const expectedLeaf = nextBaseValue + depth;
    samples.push(await marker.update(expectedLeaf, () => {
      replaceStore(baseName, nextBaseValue);
    }));
    const observedLeaf = getStore(leafName);
    if (observedLeaf !== expectedLeaf) {
      mismatchCount += 1;
    }
    if ((iteration + 1) % 80 === 0) {
      await wait(0);
    }
  }

  histogram.disable();
  marker.dispose();
  createdNames.slice().reverse().forEach((name) => deleteComputed(name));
  deleteStore(baseName);
  await flushRuntime(2);
  resetAllStoresForTest();

  return {
    depth,
    updates: COMPUTED_UPDATES,
    timing: summarizeSamples(samples),
    frameBudget: toFrameBudgetSignals(samples),
    eventLoop: toEventLoopSignals(histogram),
    valueMismatchCount: mismatchCount,
  };
};

class QueryLikeCache {
  private readonly data = new Map<string, unknown>();
  private readonly listeners = new Set<QueryCacheListener>();

  subscribe(listener: QueryCacheListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setQueryData(key: string, value: unknown): void {
    this.data.set(key, value);
    this.listeners.forEach((listener) => listener({ key, value }));
  }
}

const runQueryCoLoadScenario = async (
  mode: QueryCoLoadScenario["mode"],
): Promise<QueryCoLoadScenario> => {
  resetAllStoresForTest();
  const storeName = `adv.query.${mode}`;
  createStore(storeName, { value: 0 }, { scope: "global", devtools: false });
  for (let index = 0; index < QUERY_STORE_SUBSCRIBERS; index += 1) {
    subscribe(storeName, createUniqueNoop(index));
  }

  const cache = new QueryLikeCache();
  const disposeCacheListeners: Array<() => void> = [];
  if (mode === "stroid-plus-query-cache") {
    for (let index = 0; index < QUERY_CACHE_SUBSCRIBERS; index += 1) {
      disposeCacheListeners.push(
        cache.subscribe(({ key, value }) => {
          sink += key.length & 0;
          sink += (typeof value === "object" && value !== null) ? (index & 0) : 0;
        }),
      );
    }
  }

  const marker = createMarker(
    storeName,
    (state) => (state && typeof state === "object" && "value" in state)
      ? (state as { value: number }).value
      : undefined,
  );

  await marker.update(1, () => {
    setStore(storeName, { value: 1 });
  });

  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const startedAt = performance.now();
  const samples: number[] = [];

  for (let iteration = 0; iteration < QUERY_ITERATIONS; iteration += 1) {
    const next = iteration + 2;
    samples.push(await marker.update(next, () => {
      setStore(storeName, { value: next });
      if (mode === "stroid-plus-query-cache") {
        cache.setQueryData(`query-${next % 32}`, {
          value: next,
          payload: [next, next + 1, next + 2],
        });
      }
    }));

    if ((iteration + 1) % 80 === 0) {
      await wait(0);
    }
  }

  histogram.disable();
  const totalMs = performance.now() - startedAt;
  marker.dispose();
  disposeCacheListeners.forEach((dispose) => dispose());
  resetAllStoresForTest();

  return {
    mode,
    iterations: QUERY_ITERATIONS,
    storeSubscribers: QUERY_STORE_SUBSCRIBERS,
    cacheSubscribers: mode === "stroid-only" ? 0 : QUERY_CACHE_SUBSCRIBERS,
    timing: summarizeSamples(samples),
    frameBudget: toFrameBudgetSignals(samples),
    eventLoop: toEventLoopSignals(histogram),
    opsPerSec: round(QUERY_ITERATIONS / (totalMs / 1000)),
  };
};

const runLongSessionMemory = async (): Promise<LongSessionMemoryResult> => {
  if (typeof global.gc !== "function") {
    throw new Error("Run this benchmark with --expose-gc to measure long-session memory.");
  }

  resetAllStoresForTest();
  maybeGc();
  const baselineHeap = heapMb();
  const checkpoints: MemoryCheckpoint[] = [];
  const cycleDurations: number[] = [];
  const routes = ["home", "feed", "search", "profile", "settings"] as const;

  for (let cycle = 0; cycle < SESSION_CYCLES; cycle += 1) {
    const startedAt = performance.now();
    const route = routes[cycle % routes.length]!;
    const storeName = `adv.session.${route}.${cycle}`;
    createStore(storeName, {
      route,
      count: cycle,
      payload: Array.from({ length: 6 }, (_value, index) => `${route}-${cycle}-${index}`),
    }, { scope: "global", devtools: false });
    const off = subscribe(storeName, createUniqueNoop(cycle));
    setStore(storeName, (draft: { count: number; payload: string[] }) => {
      draft.count += 1;
      draft.payload.push(`${route}-next-${cycle}`);
      if (draft.payload.length > 8) draft.payload.shift();
    });
    off();
    deleteStore(storeName);
    cycleDurations.push(round(performance.now() - startedAt));

    if ((cycle + 1) % SESSION_BATCH_SIZE === 0) {
      await flushRuntime(2);
    }

    if ((cycle + 1) % SESSION_SAMPLE_EVERY === 0 || cycle + 1 === SESSION_CYCLES) {
      maybeGc();
      const currentHeap = heapMb();
      checkpoints.push({
        cycle: cycle + 1,
        heapMb: round(currentHeap),
        deltaMb: round(currentHeap - baselineHeap),
      });
    }
  }

  maybeGc();
  const finalHeap = heapMb();
  const retainedGrowthMb = round(finalHeap - baselineHeap);
  const peakDeltaMb = round(
    Math.max(0, ...checkpoints.map((point) => point.deltaMb), retainedGrowthMb),
  );
  const slopeMbPer1kCycles = linearRegressionSlopeMbPer1k(checkpoints);
  const monotonicIncreaseCount = countMonotonicIncreases(checkpoints);

  resetAllStoresForTest();
  return {
    cycles: SESSION_CYCLES,
    batchSize: SESSION_BATCH_SIZE,
    sampleEvery: SESSION_SAMPLE_EVERY,
    baselineHeapMb: round(baselineHeap),
    finalHeapMb: round(finalHeap),
    retainedGrowthMb,
    peakDeltaMb,
    slopeMbPer1kCycles,
    monotonicIncreaseCount,
    timing: summarizeSamples(cycleDurations),
    checkpoints,
  };
};

const runPersistFailureModes = async (): Promise<PersistFailureModeResult> => {
  resetAllStoresForTest();

  const quotaDriverStore = new Map<string, string>();
  let quotaHitCount = 0;
  let onErrorCount = 0;
  const quotaKey = "adv.persist.quota";
  const quotaDriver = {
    getItem: (key: string) => quotaDriverStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > 900) {
        quotaHitCount += 1;
        const quotaError = new Error("QuotaExceededError");
        quotaError.name = "QuotaExceededError";
        throw quotaError;
      }
      quotaDriverStore.set(key, value);
    },
    removeItem: (key: string) => {
      quotaDriverStore.delete(key);
    },
  };

  createStore("adv.persist.quota", { value: 0, payload: "seed" }, {
    scope: "global",
    persist: {
      driver: quotaDriver,
      key: quotaKey,
      encrypt: (value) => value,
      decrypt: (value) => value,
      allowPlaintext: true,
      checksum: "none",
    },
    onError: () => {
      onErrorCount += 1;
    },
  });

  const quotaSamples: number[] = [];
  for (let iteration = 0; iteration < PERSIST_WRITES; iteration += 1) {
    const startedAt = performance.now();
    const payloadSize = (iteration % 6 === 0) ? 1_600 : 300;
    setStore("adv.persist.quota", {
      value: iteration,
      payload: "x".repeat(payloadSize),
    });
    quotaSamples.push(round(performance.now() - startedAt));
    if (payloadSize > 900) {
      // Force flush on oversized payload writes so quota paths are exercised.
      await flushRuntime(3);
    } else if ((iteration + 1) % 40 === 0) {
      await flushRuntime(2);
    }
  }
  await flushRuntime(10);
  const lastPersistedLength = quotaDriverStore.get(quotaKey)?.length ?? 0;

  const raceDriverStore = new Map<string, string>();
  let writeOrder = 0;
  const raceKey = "adv.persist.race";
  const raceDriver = {
    getItem: async (key: string) => raceDriverStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      writeOrder += 1;
      const delayMs = (writeOrder % 5) * 2;
      await wait(delayMs);
      raceDriverStore.set(key, value);
    },
    removeItem: async (key: string) => {
      raceDriverStore.delete(key);
    },
  };

  createStore("adv.persist.race", { version: 0, payload: "seed" }, {
    scope: "global",
    persist: {
      driver: raceDriver,
      key: raceKey,
      encrypt: (value) => value,
      decrypt: (value) => value,
      allowPlaintext: true,
      checksum: "none",
    },
  });

  const raceSamples: number[] = [];
  let requestedVersion = 0;
  for (let iteration = 0; iteration < PERSIST_WRITES; iteration += 1) {
    requestedVersion = iteration + 1;
    const startedAt = performance.now();
    setStore("adv.persist.race", {
      version: requestedVersion,
      payload: `v-${requestedVersion}`,
    });
    raceSamples.push(round(performance.now() - startedAt));
  }
  await flushRuntime(20);
  await wait(40);

  const raceRaw = raceDriverStore.get(raceKey);
  let persistedVersion: number | null = null;
  if (typeof raceRaw === "string" && raceRaw.length > 0) {
    const envelope = JSON.parse(raceRaw) as { data?: string } | null;
    if (envelope && typeof envelope.data === "string") {
      const state = JSON.parse(envelope.data) as { version?: unknown } | null;
      if (state && typeof state.version === "number") {
        persistedVersion = state.version;
      }
    }
  }
  const consistencyViolations = persistedVersion === requestedVersion ? 0 : 1;

  let recoveries = 0;
  let failures = 0;
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const key = `adv.persist.eviction.${cycle}`;
    const storeName = `adv.persist.eviction.store.${cycle}`;
    const storage = new Map<string, string>();
    const driver = {
      getItem: (target: string) => storage.get(target) ?? null,
      setItem: (target: string, value: string) => {
        storage.set(target, value);
      },
      removeItem: (target: string) => {
        storage.delete(target);
      },
    };

    createStore(storeName, { value: 0 }, {
      scope: "global",
      persist: {
        driver,
        key,
        encrypt: (value) => value,
        decrypt: (value) => value,
        allowPlaintext: true,
        checksum: "none",
      },
    });
    setStore(storeName, { value: cycle + 1 });
    await flushRuntime(2);
    driver.removeItem(key);
    deleteStore(storeName);
    await flushRuntime(1);

    createStore(storeName, { value: -1 }, {
      scope: "global",
      persist: {
        driver,
        key,
        encrypt: (value) => value,
        decrypt: (value) => value,
        allowPlaintext: true,
        checksum: "none",
      },
    });
    await flushRuntime(2);
    const recovered = getStore(storeName) as { value?: number } | null;
    if (recovered?.value === -1) {
      recoveries += 1;
    } else {
      failures += 1;
    }
    deleteStore(storeName);
  }

  resetAllStoresForTest();

  return {
    writes: PERSIST_WRITES,
    quotaMode: {
      writeTiming: summarizeSamples(quotaSamples),
      onErrorCount,
      quotaHitCount,
      lastPersistedLength,
    },
    asyncRaceMode: {
      writeTiming: summarizeSamples(raceSamples),
      lastRequestedVersion: requestedVersion,
      persistedVersion,
      consistencyViolations,
    },
    evictionMode: {
      cycles: 20,
      recoveries,
      failures,
    },
  };
};

const mergeFrameSignals = (signals: FrameBudgetSignals[]): FrameBudgetSignals => {
  const samples = signals.reduce((sum, signal) => sum + signal.samples, 0);
  const over16Ms = signals.reduce((sum, signal) => sum + signal.over16Ms, 0);
  const over50Ms = signals.reduce((sum, signal) => sum + signal.over50Ms, 0);
  return {
    samples,
    over16Ms,
    over50Ms,
    over16Ratio: samples === 0 ? 0 : round(over16Ms / samples),
    over50Ratio: samples === 0 ? 0 : round(over50Ms / samples),
  };
};

export const runProductionRealityBenchmark = async (): Promise<ProductionRealityResult> => {
  installDevtools();
  installPersist();
  resetAllStoresForTest();
  maybeGc();

  const baselineOrigin = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    cpuCount: os.cpus().length,
    totalMemMb: round(os.totalmem() / (1024 * 1024)),
    freeMemMb: round(os.freemem() / (1024 * 1024)),
    loadAvg: os.loadavg().map((value) => round(value)),
  };

  const devtoolsScenarios = [
    await runDevtoolsScenario("disabled"),
    await runDevtoolsScenario("enabled-history-50"),
    await runDevtoolsScenario("enabled-history-500"),
  ];
  const devtoolsBaseline = devtoolsScenarios.find((scenario) => scenario.mode === "disabled");
  const devtoolsRatios: Record<string, number> = {};
  devtoolsScenarios.forEach((scenario) => {
    if (!devtoolsBaseline || devtoolsBaseline.timing.medianMs <= 0) {
      devtoolsRatios[scenario.mode] = 1;
      return;
    }
    devtoolsRatios[scenario.mode] = round(scenario.timing.medianMs / devtoolsBaseline.timing.medianMs);
  });

  const computedScenarios: ComputedDepthScenario[] = [];
  for (const depth of COMPUTED_DEPTHS) {
    computedScenarios.push(await runComputedDepthScenario(depth));
  }

  const queryScenarios = [
    await runQueryCoLoadScenario("stroid-only"),
    await runQueryCoLoadScenario("stroid-plus-query-cache"),
  ];
  const queryBase = queryScenarios.find((scenario) => scenario.mode === "stroid-only");
  const queryCoLoad = queryScenarios.find((scenario) => scenario.mode === "stroid-plus-query-cache");
  const ratioVsStroidOnly = (!queryBase || !queryCoLoad || queryBase.timing.medianMs <= 0)
    ? 1
    : round(queryCoLoad.timing.medianMs / queryBase.timing.medianMs);

  const persistFailureModes = await runPersistFailureModes();
  const longSessionMemory = await runLongSessionMemory();

  const aggregateFrameBudget = mergeFrameSignals([
    ...devtoolsScenarios.map((scenario) => scenario.frameBudget),
    ...computedScenarios.map((scenario) => scenario.frameBudget),
    ...queryScenarios.map((scenario) => scenario.frameBudget),
  ]);
  const worstEventLoopP95Ms = round(
    Math.max(
      0,
      ...devtoolsScenarios.map((scenario) => scenario.eventLoop.p95Ms),
      ...computedScenarios.map((scenario) => scenario.eventLoop.p95Ms),
      ...queryScenarios.map((scenario) => scenario.eventLoop.p95Ms),
    ),
  );
  const worstEventLoopP99Ms = round(
    Math.max(
      0,
      ...devtoolsScenarios.map((scenario) => scenario.eventLoop.p99Ms),
      ...computedScenarios.map((scenario) => scenario.eventLoop.p99Ms),
      ...queryScenarios.map((scenario) => scenario.eventLoop.p99Ms),
    ),
  );

  return {
    name: "Production Reality Benchmark",
    baselineOrigin,
    devtoolsOverhead: {
      scenarios: devtoolsScenarios,
      ratios: devtoolsRatios,
    },
    computedChainDepth: {
      scenarios: computedScenarios,
    },
    queryCoLoad: {
      scenarios: queryScenarios,
      ratioVsStroidOnly,
    },
    persistFailureModes,
    longSessionMemory,
    userPerceived: {
      aggregateFrameBudget,
      worstEventLoopP95Ms,
      worstEventLoopP99Ms,
    },
  };
};

const main = async (): Promise<void> => {
  const result = await runProductionRealityBenchmark();
  const report = {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    result,
  };

  const outputPath = path.resolve(process.cwd(), "scripts", "production-reality-benchmark-output.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  emitReport(report);
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
