import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { fetchStore } from "../src/async.js";
import { applyFeatureState } from "../src/core/store-lifecycle/registry.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import {
  getHydrationConsistency,
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "../src/runtime-tools/index.js";
import {
  createStore,
  getStore,
  hydrateStores,
  setStore,
} from "../src/store.js";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
  wait,
} from "./benchmark-guarantee-utils.js";

type ScenarioSample = {
  durationMs: number;
  queuedWrites: number;
  replayedWrites: number;
  driftEvents: number;
  sourceOrder: string;
};

type ScenarioSummary = {
  name: string;
  iterations: number;
  settleTiming: ReturnType<typeof summarizeSamples>;
  queuedWritesSeen: number[];
  replayedWritesSeen: number[];
  driftEventsSeen: number[];
  sourceOrders: string[];
  finalStateSample: unknown;
};

const ITERATIONS = Number(process.env.STROID_HYDRATION_BENCH_ITERATIONS ?? 24);
const BOOT_WINDOW_MS = Number(process.env.STROID_HYDRATION_BENCH_BOOT_WINDOW_MS ?? 10);
const NETWORK_DELAY_MS = Math.max(2, Math.floor(BOOT_WINDOW_MS / 2));

const identityValidate = <T>(candidate: T): { ok: true; value: T } => ({
  ok: true,
  value: candidate,
});

const collectDistinctNumbers = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

const collectDistinctStrings = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, "en"));

const settleBootWindow = async (): Promise<void> => {
  await wait(BOOT_WINDOW_MS + NETWORK_DELAY_MS + 8);
  await flushRuntime();
};

const summarizeScenario = (
  name: string,
  samples: ScenarioSample[],
  finalStateSample: unknown
): ScenarioSummary => ({
  name,
  iterations: samples.length,
  settleTiming: summarizeSamples(samples.map((sample) => sample.durationMs)),
  queuedWritesSeen: collectDistinctNumbers(samples.map((sample) => sample.queuedWrites)),
  replayedWritesSeen: collectDistinctNumbers(samples.map((sample) => sample.replayedWrites)),
  driftEventsSeen: collectDistinctNumbers(samples.map((sample) => sample.driftEvents)),
  sourceOrders: collectDistinctStrings(samples.map((sample) => sample.sourceOrder)),
  finalStateSample,
});

const runEffectScenario = async (): Promise<ScenarioSample> => {
  resetAllStoresForTest();
  createStore("benchCounter", { count: 0 });

  hydrateStores(
    { benchCounter: { count: 0 } },
    {},
    { allowTrusted: true },
    {
      bootWindowMs: BOOT_WINDOW_MS,
      policyMap: {
        benchCounter: "client_wins",
      },
    }
  );

  const startedAt = performance.now();
  setStore("benchCounter", (draft: { count: number }) => {
    draft.count += 1;
  });
  setStore("benchCounter", (draft: { count: number }) => {
    draft.count += 1;
  });

  assert.deepStrictEqual(getStore("benchCounter"), { count: 0 });

  await settleBootWindow();

  assert.deepStrictEqual(getStore("benchCounter"), { count: 2 });
  const metrics = getHydrationDriftMetrics();
  const events = getHydrationDriftEvents(2);

  assert.strictEqual(metrics.queuedWrites, 2);
  assert.strictEqual(metrics.replayedWrites, 2);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.deepStrictEqual(events.map((event) => event.source), ["effect", "effect"]);

  return {
    durationMs: round(performance.now() - startedAt),
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
    driftEvents: metrics.driftEvents,
    sourceOrder: events.map((event) => event.source).join(">"),
  };
};

const runStorageScenario = async (): Promise<ScenarioSample> => {
  resetAllStoresForTest();
  createStore("benchDraft", {
    revision: 0,
    source: "server",
  });

  hydrateStores(
    {
      benchDraft: {
        revision: 0,
        source: "server",
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindowMs: BOOT_WINDOW_MS,
      policyMap: {
        benchDraft: "client_wins",
      },
    }
  );

  const startedAt = performance.now();
  applyFeatureState("benchDraft", {
    revision: 1,
    source: "storage",
  }, Date.now(), {
    source: "storage",
    validate: identityValidate,
  });

  assert.deepStrictEqual(getStore("benchDraft"), {
    revision: 0,
    source: "server",
  });

  await settleBootWindow();

  assert.deepStrictEqual(getStore("benchDraft"), {
    revision: 1,
    source: "storage",
  });
  const metrics = getHydrationDriftMetrics();
  const events = getHydrationDriftEvents(1);

  assert.strictEqual(metrics.queuedWrites, 1);
  assert.strictEqual(metrics.replayedWrites, 1);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.deepStrictEqual(events.map((event) => event.source), ["storage"]);

  return {
    durationMs: round(performance.now() - startedAt),
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
    driftEvents: metrics.driftEvents,
    sourceOrder: events.map((event) => event.source).join(">"),
  };
};

const runSyncScenario = async (): Promise<ScenarioSample> => {
  resetAllStoresForTest();
  createStore("benchPresence", {
    revision: 0,
    peers: 0,
  });

  hydrateStores(
    {
      benchPresence: {
        revision: 0,
        peers: 0,
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindowMs: BOOT_WINDOW_MS,
      policyMap: {
        benchPresence: "client_wins",
      },
    }
  );

  const startedAt = performance.now();
  applyFeatureState("benchPresence", { revision: 1, peers: 1 }, Date.now(), {
    source: "sync",
    validate: identityValidate,
  });
  applyFeatureState("benchPresence", { revision: 2, peers: 2 }, Date.now(), {
    source: "sync",
    validate: identityValidate,
  });
  applyFeatureState("benchPresence", { revision: 3, peers: 3 }, Date.now(), {
    source: "sync",
    validate: identityValidate,
  });

  assert.deepStrictEqual(getStore("benchPresence"), {
    revision: 0,
    peers: 0,
  });

  await settleBootWindow();

  assert.deepStrictEqual(getStore("benchPresence"), {
    revision: 3,
    peers: 3,
  });
  const metrics = getHydrationDriftMetrics();
  const events = getHydrationDriftEvents(3);

  assert.strictEqual(metrics.queuedWrites, 3);
  assert.strictEqual(metrics.replayedWrites, 3);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.deepStrictEqual(events.map((event) => event.source), ["sync", "sync", "sync"]);

  return {
    durationMs: round(performance.now() - startedAt),
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
    driftEvents: metrics.driftEvents,
    sourceOrder: events.map((event) => event.source).join(">"),
  };
};

const runNetworkScenario = async (): Promise<ScenarioSample> => {
  resetAllStoresForTest();
  createStore("benchRemote", {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  });

  hydrateStores(
    {
      benchRemote: {
        data: "server",
        loading: false,
        error: null,
        status: "success",
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindowMs: BOOT_WINDOW_MS,
      policyMap: {
        benchRemote: "client_wins",
      },
    }
  );

  const controller = new AbortController();
  const startedAt = performance.now();
  const request = fetchStore(
    "benchRemote",
    async () => {
      await wait(NETWORK_DELAY_MS);
      return "fresh";
    },
    {
      dedupe: false,
      signal: controller.signal,
    }
  );

  await wait(NETWORK_DELAY_MS + 1);

  assert.deepStrictEqual(getStore("benchRemote"), {
    data: "server",
    loading: false,
    error: null,
    status: "success",
  });

  await request;
  await settleBootWindow();

  const remote = getStore("benchRemote") as any;
  assert.strictEqual(remote?.data, "fresh");
  assert.strictEqual(remote?.loading, false);

  const metrics = getHydrationDriftMetrics();
  const events = getHydrationDriftEvents(2);

  assert.strictEqual(metrics.queuedWrites, 2);
  assert.strictEqual(metrics.replayedWrites, 2);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.deepStrictEqual(events.map((event) => event.source), ["network", "network"]);

  return {
    durationMs: round(performance.now() - startedAt),
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
    driftEvents: metrics.driftEvents,
    sourceOrder: events.map((event) => event.source).join(">"),
  };
};

const runScenarioBench = async (
  name: string,
  runner: () => Promise<ScenarioSample>,
  finalStateReader: () => unknown
): Promise<ScenarioSummary> => {
  const samples: ScenarioSample[] = [];

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    samples.push(await runner());
    await flushRuntime();
    maybeGc();
  }

  return summarizeScenario(name, samples, finalStateReader());
};

export const runHydrationDivergenceBenchmark = async () => {
  const scenarios = [
    await runScenarioBench(
      "Early user input during hydration",
      runEffectScenario,
      () => getStore("benchCounter")
    ),
    await runScenarioBench(
      "Stale local storage restore",
      runStorageScenario,
      () => getStore("benchDraft")
    ),
    await runScenarioBench(
      "Websocket burst right after boot",
      runSyncScenario,
      () => getStore("benchPresence")
    ),
    await runScenarioBench(
      "Slow network revalidate",
      runNetworkScenario,
      () => getStore("benchRemote")
    ),
  ];

  const reports = getHydrationConsistency();
  assert.ok(Array.isArray(reports) && reports.length === 1);

  return {
    name: "Hydration Divergence Certification",
    iterationsPerScenario: ITERATIONS,
    bootWindowMs: BOOT_WINDOW_MS,
    scenarios,
    certifiedRuns: ITERATIONS * scenarios.length,
    unexpectedOutcomes: 0,
  };
};

const main = async () => {
  const result = await runHydrationDivergenceBenchmark();
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
