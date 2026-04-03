import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { fetchStore } from "../src/async.js";
import { applyFeatureState } from "../src/core/store-lifecycle/registry.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import { getHydrationDriftEvents, getHydrationDriftMetrics } from "../src/runtime-tools/index.js";
import { createStore, getStore, hydrateStores, replaceStore, setStore } from "../src/store.js";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
  wait,
} from "./benchmark-guarantee-utils.js";

type CampaignProfile = "try" | "hit" | "stress" | "hammer";

type DriftSource = "server" | "effect" | "storage" | "sync";

type AsyncState = {
  data: string | null;
  loading: boolean;
  error: string | null;
  status: "idle" | "loading" | "success" | "error" | "aborted";
};

type CampaignSample = {
  durationMs: number;
  queuedWrites: number;
  replayedWrites: number;
  driftEvents: number;
  sourceOrderPreview: string;
};

type CampaignResult = {
  name: string;
  profile: CampaignProfile;
  runs: number;
  writesPerRun: number;
  timing: ReturnType<typeof summarizeSamples>;
  queuedWritesSeen: number[];
  replayedWritesSeen: number[];
  driftEventsSeen: number[];
  sourceOrderPreviews: string[];
  unexpectedOutcomes: number;
  invariantViolations: number;
  guaranteeBoundary: "manual-close";
  finalStateSample: unknown;
  note: string;
};

const TRY_RUNS = Number(process.env.STROID_HYDRATION_TRY_RUNS ?? 16);
const HIT_RUNS = Number(process.env.STROID_HYDRATION_HIT_RUNS ?? 12);
const STRESS_RUNS = Number(process.env.STROID_HYDRATION_STRESS_RUNS ?? 18);
const STRESS_WRITES = Number(process.env.STROID_HYDRATION_STRESS_WRITES ?? 18);
const HAMMER_RUNS = Number(process.env.STROID_HYDRATION_HAMMER_RUNS ?? 8);
const HAMMER_CYCLES = Number(process.env.STROID_HYDRATION_HAMMER_CYCLES ?? 24);
const NETWORK_DELAY_MS = Number(process.env.STROID_HYDRATION_NETWORK_DELAY_MS ?? 4);

const identityValidate = <T>(candidate: T): { ok: true; value: T } => ({
  ok: true,
  value: candidate,
});

const createAsyncState = (data: string): AsyncState => ({
  data,
  loading: false,
  error: null,
  status: "success",
});

const distinctNumbers = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

const distinctStrings = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, "en"));

const previewSourceOrder = (sources: string[]): string => {
  if (sources.length <= 10) return sources.join(">");
  return `${sources.slice(0, 5).join(">")}>...>${sources.slice(-5).join(">")}`;
};

const crossAsyncBoundary = async (index: number): Promise<void> => {
  const slot = index % 4;
  if (slot === 1) {
    await Promise.resolve();
    return;
  }
  if (slot === 2) {
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    return;
  }
  if (slot === 3) {
    await wait(0);
  }
};

const settleAfterClose = async (): Promise<void> => {
  await wait(0);
  await wait(0);
  await flushRuntime(6);
};

const assertManualBootWindow = (
  hydration: ReturnType<typeof hydrateStores>
): NonNullable<ReturnType<typeof hydrateStores>["bootWindow"]> => {
  assert.ok(hydration.bootWindow, "manual hydration boot window control should be returned");
  assert.strictEqual(hydration.bootWindow?.mode, "manual");
  assert.strictEqual(hydration.bootWindow?.isActive(), true);
  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.bootWindowMode, "manual");
  assert.strictEqual(metrics.manualCloseAvailable, true);
  assert.strictEqual(metrics.bootWindowActive, true);
  return hydration.bootWindow!;
};

const summarizeCampaign = (
  name: string,
  profile: CampaignProfile,
  writesPerRun: number,
  samples: CampaignSample[],
  finalStateSample: unknown,
  note: string
): CampaignResult => ({
  name,
  profile,
  runs: samples.length,
  writesPerRun,
  timing: summarizeSamples(samples.map((sample) => sample.durationMs)),
  queuedWritesSeen: distinctNumbers(samples.map((sample) => sample.queuedWrites)),
  replayedWritesSeen: distinctNumbers(samples.map((sample) => sample.replayedWrites)),
  driftEventsSeen: distinctNumbers(samples.map((sample) => sample.driftEvents)),
  sourceOrderPreviews: distinctStrings(samples.map((sample) => sample.sourceOrderPreview)),
  unexpectedOutcomes: 0,
  invariantViolations: 0,
  guaranteeBoundary: "manual-close",
  finalStateSample,
  note,
});

const runTryCase = async (): Promise<{ sample: CampaignSample; finalState: unknown }> => {
  resetAllStoresForTest();
  createStore("tryCounter", { count: 0 });
  createStore("tryPrefs", { theme: "light" });
  createStore("tryPresence", { online: false });
  createStore("tryRemote", createAsyncState("server"));

  const hydration = hydrateStores(
    {
      tryCounter: { count: 0 },
      tryPrefs: { theme: "light" },
      tryPresence: { online: false },
      tryRemote: createAsyncState("server"),
    },
    {},
    { allowTrusted: true },
    {
      bootWindow: { mode: "manual" },
      maxEvents: 16,
      policyMap: {
        tryCounter: "client_wins",
        tryPrefs: "client_wins",
        tryPresence: "client_wins",
        tryRemote: "client_wins",
      },
    }
  );

  const boot = assertManualBootWindow(hydration);
  const startedAt = performance.now();

  setStore("tryCounter", (draft: { count: number }) => {
    draft.count += 1;
  });
  applyFeatureState("tryPrefs", { theme: "dark" }, Date.now(), {
    source: "storage",
    validate: identityValidate,
  });
  applyFeatureState("tryPresence", { online: true }, Date.now(), {
    source: "sync",
    validate: identityValidate,
  });

  const controller = new AbortController();
  const request = fetchStore(
    "tryRemote",
    async () => {
      await wait(NETWORK_DELAY_MS);
      return "fresh";
    },
    {
      dedupe: false,
      signal: controller.signal,
    }
  );

  await wait(NETWORK_DELAY_MS + 4);
  await request;

  assert.deepStrictEqual(getStore("tryCounter"), { count: 0 });
  assert.deepStrictEqual(getStore("tryPrefs"), { theme: "light" });
  assert.deepStrictEqual(getStore("tryPresence"), { online: false });
  assert.deepStrictEqual(getStore("tryRemote"), createAsyncState("server"));
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 5);

  boot.close();
  assert.strictEqual(boot.isActive(), false);
  await settleAfterClose();

  const remote = getStore("tryRemote") as AsyncState | null;
  assert.deepStrictEqual(getStore("tryCounter"), { count: 1 });
  assert.deepStrictEqual(getStore("tryPrefs"), { theme: "dark" });
  assert.deepStrictEqual(getStore("tryPresence"), { online: true });
  assert.strictEqual(remote?.data, "fresh");
  assert.strictEqual(remote?.loading, false);

  const events = getHydrationDriftEvents(5);
  const sources = events.map((event) => event.source);
  assert.deepStrictEqual(sources, ["effect", "storage", "sync", "network", "network"]);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, 5);
  assert.strictEqual(metrics.replayedWrites, 5);
  assert.strictEqual(metrics.driftEvents, 5);
  assert.strictEqual(metrics.pendingWrites, 0);
  assert.strictEqual(metrics.bootWindowActive, false);

  return {
    sample: {
      durationMs: round(performance.now() - startedAt),
      queuedWrites: metrics.queuedWrites,
      replayedWrites: metrics.replayedWrites,
      driftEvents: metrics.driftEvents,
      sourceOrderPreview: previewSourceOrder(sources),
    },
    finalState: {
      counter: getStore("tryCounter"),
      prefs: getStore("tryPrefs"),
      presence: getStore("tryPresence"),
      remote: getStore("tryRemote"),
    },
  };
};

const runHitCase = async (): Promise<{ sample: CampaignSample; finalState: unknown }> => {
  resetAllStoresForTest();
  createStore("hitSession", { token: "server" });
  createStore("hitDraft", { value: "server" });
  createStore("hitFilters", {
    q: "server",
    nested: { server: true, client: false },
  });
  createStore("hitRemote", createAsyncState("server"));

  const controller = new AbortController();
  await fetchStore("hitRemote", () => Promise.resolve("fresh"), { signal: controller.signal });
  replaceStore("hitRemote", createAsyncState("server"));

  let invalidations = 0;
  const hydration = hydrateStores(
    {
      hitSession: { token: "server" },
      hitDraft: { value: "server" },
      hitFilters: {
        q: "server",
        nested: { server: true, client: false },
      },
      hitRemote: createAsyncState("server"),
    },
    {},
    { allowTrusted: true },
    {
      bootWindow: { mode: "manual" },
      maxEvents: 16,
      policyMap: {
        hitSession: "server_wins",
        hitDraft: "client_wins",
        hitFilters: "merge",
        hitRemote: {
          policy: "invalidate_and_refetch",
          onInvalidate: () => {
            invalidations += 1;
          },
        },
      },
    }
  );

  const boot = assertManualBootWindow(hydration);
  const startedAt = performance.now();

  setStore("hitSession", "token", "client");
  setStore("hitDraft", "value", "client");
  setStore("hitFilters", {
    q: "client",
    nested: { client: true },
  } as unknown as Partial<{ q: string; nested: { server: boolean; client: boolean } }>);
  replaceStore("hitRemote", createAsyncState("client"));

  assert.deepStrictEqual(getStore("hitSession"), { token: "server" });
  assert.deepStrictEqual(getStore("hitDraft"), { value: "server" });
  assert.deepStrictEqual(getStore("hitFilters"), {
    q: "server",
    nested: { server: true, client: false },
  });
  assert.deepStrictEqual(getStore("hitRemote"), createAsyncState("server"));
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, 4);

  boot.close();
  await settleAfterClose();
  await settleAfterClose();

  assert.deepStrictEqual(getStore("hitSession"), { token: "server" });
  assert.deepStrictEqual(getStore("hitDraft"), { value: "client" });
  assert.deepStrictEqual(getStore("hitFilters"), {
    q: "client",
    nested: { server: true, client: true },
  });
  const remote = getStore("hitRemote") as AsyncState | null;
  assert.strictEqual(remote?.data, "fresh");
  assert.strictEqual(invalidations, 1);

  const events = getHydrationDriftEvents(4);
  const resolutions = events.map((event) => event.resolution);
  assert.deepStrictEqual(resolutions, [
    "server_reverted",
    "client_kept",
    "merged",
    "invalidated",
  ]);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, 4);
  assert.strictEqual(metrics.replayedWrites, 4);
  assert.strictEqual(metrics.driftEvents, 4);
  assert.strictEqual(metrics.invalidations, 1);
  assert.strictEqual(metrics.pendingWrites, 0);

  return {
    sample: {
      durationMs: round(performance.now() - startedAt),
      queuedWrites: metrics.queuedWrites,
      replayedWrites: metrics.replayedWrites,
      driftEvents: metrics.driftEvents,
      sourceOrderPreview: previewSourceOrder(events.map((event) => event.source)),
    },
    finalState: {
      session: getStore("hitSession"),
      draft: getStore("hitDraft"),
      filters: getStore("hitFilters"),
      remote: getStore("hitRemote"),
    },
  };
};

const runStressCase = async (): Promise<{ sample: CampaignSample; finalState: unknown }> => {
  resetAllStoresForTest();
  const initialTimeline: { revision: number; source: DriftSource } = {
    revision: 0,
    source: "server",
  };
  createStore("stressTimeline", initialTimeline);

  const hydration = hydrateStores(
    {
      stressTimeline: {
        revision: 0,
        source: "server",
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindow: { mode: "manual" },
      maxEvents: STRESS_WRITES + 8,
      policyMap: {
        stressTimeline: "client_wins",
      },
    }
  );

  const boot = assertManualBootWindow(hydration);
  const startedAt = performance.now();
  const sourceOrder: Array<"effect" | "storage" | "sync"> = [];

  for (let index = 0; index < STRESS_WRITES; index += 1) {
    await crossAsyncBoundary(index);
    const revision = index + 1;
    const source = (["effect", "storage", "sync"] as const)[index % 3];
    sourceOrder.push(source);
    if (source === "effect") {
      setStore("stressTimeline", {
        revision,
        source,
      });
      continue;
    }
    applyFeatureState("stressTimeline", {
      revision,
      source,
    }, Date.now(), {
      source,
      validate: identityValidate,
    });
  }

  assert.deepStrictEqual(getStore("stressTimeline"), {
    revision: 0,
    source: "server",
  });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, STRESS_WRITES);

  boot.close();
  await settleAfterClose();

  assert.deepStrictEqual(getStore("stressTimeline"), {
    revision: STRESS_WRITES,
    source: sourceOrder[sourceOrder.length - 1],
  });

  const events = getHydrationDriftEvents(STRESS_WRITES);
  assert.deepStrictEqual(events.map((event) => event.source), sourceOrder);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, STRESS_WRITES);
  assert.strictEqual(metrics.replayedWrites, STRESS_WRITES);
  assert.strictEqual(metrics.driftEvents, STRESS_WRITES);
  assert.strictEqual(metrics.pendingWrites, 0);

  return {
    sample: {
      durationMs: round(performance.now() - startedAt),
      queuedWrites: metrics.queuedWrites,
      replayedWrites: metrics.replayedWrites,
      driftEvents: metrics.driftEvents,
      sourceOrderPreview: previewSourceOrder(sourceOrder),
    },
    finalState: getStore("stressTimeline"),
  };
};

const runHammerCase = async (): Promise<{ sample: CampaignSample; finalState: unknown }> => {
  resetAllStoresForTest();
  createStore("hammerCounter", { count: 0 });
  const initialPrefs: { revision: number; source: DriftSource } = {
    revision: 0,
    source: "server",
  };
  createStore("hammerPrefs", initialPrefs);
  createStore("hammerPresence", {
    revision: 0,
    peers: 0,
  });

  const hydration = hydrateStores(
    {
      hammerCounter: { count: 0 },
      hammerPrefs: {
        revision: 0,
        source: "server",
      },
      hammerPresence: {
        revision: 0,
        peers: 0,
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindow: { mode: "manual" },
      maxEvents: (HAMMER_CYCLES * 3) + 8,
      policyMap: {
        hammerCounter: "client_wins",
        hammerPrefs: "client_wins",
        hammerPresence: "client_wins",
      },
    }
  );

  const boot = assertManualBootWindow(hydration);
  const startedAt = performance.now();
  const sourceOrder: Array<"effect" | "storage" | "sync"> = [];

  for (let cycle = 0; cycle < HAMMER_CYCLES; cycle += 1) {
    const revision = cycle + 1;

    await crossAsyncBoundary(cycle * 3);
    sourceOrder.push("effect");
    setStore("hammerCounter", (draft: { count: number }) => {
      draft.count += 1;
    });

    await crossAsyncBoundary((cycle * 3) + 1);
    sourceOrder.push("storage");
    applyFeatureState("hammerPrefs", {
      revision,
      source: "storage",
    }, Date.now(), {
      source: "storage",
      validate: identityValidate,
    });

    await crossAsyncBoundary((cycle * 3) + 2);
    sourceOrder.push("sync");
    applyFeatureState("hammerPresence", {
      revision,
      peers: revision,
    }, Date.now(), {
      source: "sync",
      validate: identityValidate,
    });
  }

  const totalWrites = HAMMER_CYCLES * 3;
  assert.deepStrictEqual(getStore("hammerCounter"), { count: 0 });
  assert.deepStrictEqual(getStore("hammerPrefs"), {
    revision: 0,
    source: "server",
  });
  assert.deepStrictEqual(getStore("hammerPresence"), {
    revision: 0,
    peers: 0,
  });
  assert.strictEqual(getHydrationDriftMetrics().pendingWrites, totalWrites);

  boot.close();
  await settleAfterClose();

  assert.deepStrictEqual(getStore("hammerCounter"), { count: HAMMER_CYCLES });
  assert.deepStrictEqual(getStore("hammerPrefs"), {
    revision: HAMMER_CYCLES,
    source: "storage",
  });
  assert.deepStrictEqual(getStore("hammerPresence"), {
    revision: HAMMER_CYCLES,
    peers: HAMMER_CYCLES,
  });

  const events = getHydrationDriftEvents(totalWrites);
  assert.deepStrictEqual(events.map((event) => event.source), sourceOrder);

  const metrics = getHydrationDriftMetrics();
  assert.strictEqual(metrics.queuedWrites, totalWrites);
  assert.strictEqual(metrics.replayedWrites, totalWrites);
  assert.strictEqual(metrics.driftEvents, totalWrites);
  assert.strictEqual(metrics.pendingWrites, 0);

  return {
    sample: {
      durationMs: round(performance.now() - startedAt),
      queuedWrites: metrics.queuedWrites,
      replayedWrites: metrics.replayedWrites,
      driftEvents: metrics.driftEvents,
      sourceOrderPreview: previewSourceOrder(sourceOrder),
    },
    finalState: {
      counter: getStore("hammerCounter"),
      prefs: getStore("hammerPrefs"),
      presence: getStore("hammerPresence"),
    },
  };
};

const runCampaign = async (
  name: string,
  profile: CampaignProfile,
  runs: number,
  writesPerRun: number,
  runner: () => Promise<{ sample: CampaignSample; finalState: unknown }>,
  note: string
): Promise<CampaignResult> => {
  const samples: CampaignSample[] = [];
  let finalStateSample: unknown = null;

  for (let run = 0; run < runs; run += 1) {
    const result = await runner();
    samples.push(result.sample);
    finalStateSample = result.finalState;
    maybeGc();
  }

  return summarizeCampaign(
    name,
    profile,
    writesPerRun,
    samples,
    finalStateSample,
    note
  );
};

export const runHydrationDivergenceBenchmark = async () => {
  const campaigns = [
    await runCampaign(
      "Try: mixed-source queue stays sealed until explicit close",
      "try",
      TRY_RUNS,
      5,
      runTryCase,
      "Proves no pre-close leak across effect, storage, sync, and network writes when the boot window is closed manually."
    ),
    await runCampaign(
      "Hit: policy matrix stays deterministic after replay",
      "hit",
      HIT_RUNS,
      4,
      runHitCase,
      "Exercises server_wins, client_wins, merge, and invalidate_and_refetch under the same manual-close boundary."
    ),
    await runCampaign(
      "Stress: repeated mixed-source replay preserves exact order",
      "stress",
      STRESS_RUNS,
      STRESS_WRITES,
      runStressCase,
      "Runs mixed-source writes across microtask and timer boundaries while the queue is open, then verifies exact replay order."
    ),
    await runCampaign(
      "Hammer: high-volume queued writes survive without leak or reorder",
      "hammer",
      HAMMER_RUNS,
      HAMMER_CYCLES * 3,
      runHammerCase,
      "Queues a larger volume of interleaved effect, storage, and sync writes before a single explicit close signal."
    ),
  ];

  const certifiedRuns = campaigns.reduce((sum, campaign) => sum + campaign.runs, 0);
  const unexpectedOutcomes = campaigns.reduce((sum, campaign) => sum + campaign.unexpectedOutcomes, 0);
  const invariantViolations = campaigns.reduce((sum, campaign) => sum + campaign.invariantViolations, 0);
  const totalQueuedWrites = campaigns.reduce(
    (sum, campaign) => sum + (campaign.runs * campaign.writesPerRun),
    0
  );

  assert.strictEqual(unexpectedOutcomes, 0, "Hydration divergence guarantee suite observed unexpected outcomes");
  assert.strictEqual(invariantViolations, 0, "Hydration divergence guarantee suite observed invariant violations");

  return {
    name: "Hydration Divergence Guarantee Suite",
    bootWindowMode: "manual",
    campaigns,
    certification: {
      guaranteeBoundary: "manual-close",
      certifiedRuns,
      totalQueuedWrites,
      unexpectedOutcomes,
      invariantViolations,
    },
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
