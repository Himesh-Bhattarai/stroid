import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import {
  createStoreForRequest,
  type StoreRegistry,
} from "../src/server/index.js";
import {
  defaultRegistryScope,
  getRequestCarrier,
  getStoreRegistry,
} from "../src/core/store-registry.js";
import {
  _hasStoreEntryInternal,
  getStore,
  setStore,
  store,
  subscribe,
} from "../src/store.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import { useStore } from "../src/react/index.js";
import { getStoreHealth, listStores } from "../src/runtime-tools/index.js";
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

type SessionState = {
  requestId: number;
  token: string;
  phase: string;
  steps: string[];
  checksum: number;
  aborted: boolean;
  boundaryTrail: string[];
};

type TraceEntry = {
  seq: number;
  boundary: string;
  event: string;
  observedRequestId: number | null;
  carrierRequestId: number | null;
  note?: string;
};

type FailureDetail = {
  phase: string;
  kind:
    | "foreign-read"
    | "context-mismatch"
    | "post-lifecycle-access"
    | "registry-residual"
    | "subscriber-residual"
    | "unexpected-error"
    | "memory-growth";
  requestId?: number;
  peerRequestId?: number;
  boundary: string;
  message: string;
  trace: TraceEntry[];
};

type InvariantCounters = {
  foreignReadCount: number;
  contextMismatchCount: number;
  postLifecycleAccessSuccess: number;
  registryResidualCount: number;
  subscriberResidualCount: number;
};

type SuiteState = {
  invariants: InvariantCounters;
  failures: FailureDetail[];
  failureCount: number;
  maxConcurrentCorrectnessViolations: number;
};

type CampaignResult = {
  name: string;
  seed: number;
  requests: number;
  abortedRequests: number;
  timing: ReturnType<typeof summarizeSamples>;
};

type InterleavingResult = {
  name: string;
  pairs: number;
  requests: number;
  timing: ReturnType<typeof summarizeSamples>;
};

type LifecycleEscapeResult = {
  name: string;
  requests: number;
  probes: number;
  timing: ReturnType<typeof summarizeSamples>;
};

type SustainedPressureResult = {
  name: string;
  waves: number;
  concurrentPerWave: number;
  totalRequests: number;
  abortedRequests: number;
  requestTiming: ReturnType<typeof summarizeSamples>;
  waveTiming: ReturnType<typeof summarizeSamples>;
  throughputRequestsPerSec: number;
  totalWallMs: number;
};

type ReactStreamingResult = {
  name: string;
  requests: number;
  concurrentRequests: number;
  responseTiming: ReturnType<typeof summarizeSamples>;
  shellTiming: ReturnType<typeof summarizeSamples>;
  allReadyTiming: ReturnType<typeof summarizeSamples>;
  responseBytes: {
    median: number;
    p95: number;
    max: number;
  };
  totalWallMs: number;
};

type MemoryCheckpoint = {
  requests: number;
  heapMb: number;
  deltaMb: number;
};

type MemoryResult = {
  name: string;
  warmupCycles: number;
  cycles: number;
  batchSize: number;
  baselineHeapMb: number;
  finalHeapMb: number;
  retainedGrowthMb: number;
  peakDeltaMb: number;
  memoryGrowthSlopeMbPer1k: number;
  monotonicIncreaseCount: number;
  timing: ReturnType<typeof summarizeSamples>;
  checkpoints: MemoryCheckpoint[];
};

type CertificationResult = {
  name: string;
  chaosCampaigns: CampaignResult[];
  sustainedPressure: SustainedPressureResult;
  crossRequestInterleaving: InterleavingResult;
  lifecycleEscape: LifecycleEscapeResult;
  reactStreamingHttp: ReactStreamingResult;
  memoryStability: MemoryResult;
  requests: {
    concurrentPerCampaign: number;
    chaosCampaigns: number;
    sustainedConcurrency: number;
    sustainedWaves: number;
    sustainedRequests: number;
    totalChaoticRequests: number;
    interleavingRequests: number;
    lifecycleRequests: number;
    reactStreamingRequests: number;
    memoryCycles: number;
  };
  timing: ReturnType<typeof summarizeSamples>;
  totalWallMs: number;
  invariants: InvariantCounters & {
    maxConcurrentCorrectnessViolations: number;
    failureCount: number;
    globalStoreCountAfterRun: number;
  };
  failures: FailureDetail[];
};

type DetachedProbe = {
  requestId: number;
  phase: string;
  boundary: string;
  trace: TraceEntry[];
  run: () => Promise<void>;
};

const CHAOS_REQUESTS = Number(process.env.STROID_SSR_CHAOS_REQUESTS ?? 1024);
const CHAOS_SEEDS = [
  Number(process.env.STROID_SSR_SEED_A ?? 0x5eed1234),
  Number(process.env.STROID_SSR_SEED_B ?? 0xc0ffee12),
] as const;
const ABORT_EVERY = Number(process.env.STROID_SSR_ABORT_EVERY ?? 17);
const SUSTAINED_CONCURRENCY = Number(process.env.STROID_SSR_SUSTAINED_CONCURRENCY ?? 1024);
const SUSTAINED_WAVES = Number(process.env.STROID_SSR_SUSTAINED_WAVES ?? 8);
const INTERLEAVING_PAIRS = Number(process.env.STROID_SSR_INTERLEAVING_PAIRS ?? 96);
const LIFECYCLE_REQUESTS = Number(process.env.STROID_SSR_LIFECYCLE_REQUESTS ?? 512);
const REACT_STREAMING_REQUESTS = Number(process.env.STROID_SSR_REACT_STREAMING_REQUESTS ?? 256);
const MEMORY_WARMUP_CYCLES = Number(process.env.STROID_SSR_MEMORY_WARMUP_CYCLES ?? 2000);
const MEMORY_CYCLES = Number(process.env.STROID_SSR_MEMORY_CYCLES ?? 50000);
const MEMORY_BATCH_SIZE = Number(process.env.STROID_SSR_MEMORY_BATCH_SIZE ?? 100);
const MEMORY_SAMPLE_EVERY = Number(process.env.STROID_SSR_MEMORY_SAMPLE_EVERY ?? 1000);
const MAX_FAILURE_DETAILS = 24;
const MAX_MEMORY_SLOPE_MB_PER_1K = Number(
  process.env.STROID_SSR_MAX_MEMORY_SLOPE_MB_PER_1K ?? 0.45,
);
const MAX_RETAINED_GROWTH_MB = Number(
  process.env.STROID_SSR_MAX_RETAINED_GROWTH_MB ?? 8,
);
const MONOTONIC_EPSILON_MB = 0.05;

class CertificationError extends Error {
  report: CertificationResult;

  constructor(message: string, report: CertificationResult) {
    super(message);
    this.name = "CertificationError";
    this.report = report;
  }
}

const createRng = (seed: number) => () => {
  seed = ((seed * 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const nextImmediate = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const nextMicrotask = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
};

const createSession = (requestId: number, phase: string): SessionState => ({
  requestId,
  token: `token-${requestId}`,
  phase,
  steps: ["init"],
  checksum: requestId * 100,
  aborted: false,
  boundaryTrail: [],
});

const sessionStoreHandle = store<"session", SessionState>("session");

type TextResource = {
  read: () => string;
};

const createTextResource = (
  label: string,
  requestId: number,
  delayMs: number,
): TextResource => {
  let status: "pending" | "resolved" | "rejected" = "pending";
  let value = "";
  let failure: unknown;
  const promise = wait(delayMs).then(
    () => {
      status = "resolved";
      value = `${label}-${requestId}`;
    },
    (error) => {
      status = "rejected";
      failure = error;
    },
  );

  return {
    read: () => {
      if (status === "pending") throw promise;
      if (status === "rejected") throw failure;
      return value;
    },
  };
};

const StreamingHeader = ({ requestId }: { requestId: number }) => {
  const token = useStore(sessionStoreHandle, "token");
  const phase = useStore(sessionStoreHandle, "phase");
  return React.createElement(
    "header",
    null,
    `${token ?? "missing-token"}|${phase ?? "missing-phase"}|request-${requestId}`,
  );
};

const InnerChunk = ({
  requestId,
  resource,
}: {
  requestId: number;
  resource: TextResource;
}) =>
  React.createElement("strong", null, `inner-${requestId}:${resource.read()}`);

const OuterChunk = ({
  requestId,
  outer,
  inner,
}: {
  requestId: number;
  outer: TextResource;
  inner: TextResource;
}) =>
  React.createElement(
    "section",
    null,
    React.createElement("div", null, `outer-${requestId}:${outer.read()}`),
    React.createElement(
      React.Suspense,
      {
        fallback: React.createElement("em", null, `loading-inner-${requestId}`),
      },
      React.createElement(InnerChunk, { requestId, resource: inner }),
    ),
  );

const StreamingApp = ({
  requestId,
  outer,
  inner,
}: {
  requestId: number;
  outer: TextResource;
  inner: TextResource;
}) =>
  React.createElement(
    "main",
    null,
    React.createElement(StreamingHeader, { requestId }),
    React.createElement(
      React.Suspense,
      {
        fallback: React.createElement("p", null, `loading-outer-${requestId}`),
      },
      React.createElement(OuterChunk, { requestId, outer, inner }),
    ),
  );

const pushTrace = (
  trace: TraceEntry[],
  boundary: string,
  event: string,
  note?: string,
): void => {
  const carrier = getRequestCarrier() as { session?: SessionState } | null;
  const observed = _hasStoreEntryInternal("session")
    ? getStore("session") as SessionState | null
    : null;
  trace.push({
    seq: trace.length + 1,
    boundary,
    event,
    observedRequestId: observed?.requestId ?? null,
    carrierRequestId: carrier?.session?.requestId ?? null,
    note,
  });
  if (trace.length > 40) {
    trace.shift();
    trace.forEach((entry, index) => {
      entry.seq = index + 1;
    });
  }
};

const createSuiteState = (): SuiteState => ({
  invariants: {
    foreignReadCount: 0,
    contextMismatchCount: 0,
    postLifecycleAccessSuccess: 0,
    registryResidualCount: 0,
    subscriberResidualCount: 0,
  },
  failures: [],
  failureCount: 0,
  maxConcurrentCorrectnessViolations: 0,
});

const cloneTrace = (trace: TraceEntry[]): TraceEntry[] =>
  trace.map((entry) => ({ ...entry }));

const recordFailure = (
  suite: SuiteState,
  failure: FailureDetail,
): void => {
  suite.failureCount += 1;
  if (suite.failures.length < MAX_FAILURE_DETAILS) {
    suite.failures.push(failure);
  }
};

const recordInvariantFailure = (
  suite: SuiteState,
  key: keyof InvariantCounters,
  failure: FailureDetail,
): void => {
  suite.invariants[key] += 1;
  recordFailure(suite, failure);
};

const countRegistrySubscribers = (registry: StoreRegistry): number =>
  Object.values(registry.subscribers).reduce(
    (count, bucket) => count + bucket.size,
    0,
  );

const countRequestRuntimeResiduals = (registry: StoreRegistry): number =>
  registry.transaction.depth
  + registry.transaction.pending.length
  + registry.transaction.stagedValues.size
  + registry.transaction.snapshotCache.size
  + registry.notify.pendingNotifications.size
  + (registry.notify.notifyScheduled ? 1 : 0)
  + registry.notify.batchDepth
  + (registry.notify.isFlushing ? 1 : 0)
  + Object.keys(registry.async.inflight).length
  + Object.keys(registry.async.revalidateHandlers).length
  + registry.async.revalidateKeys.size
  + (registry.async.ratePruneTimer ? 1 : 0);

const countGlobalRegistryResiduals = (): number => {
  const registry = getStoreRegistry(defaultRegistryScope);
  return Object.keys(registry.stores).length
    + Object.keys(registry.subscribers).length
    + Object.keys(registry.initialStates).length
    + Object.keys(registry.initialFactories).length
    + Object.keys(registry.metaEntries).length
    + Object.keys(registry.snapshotCache).length
    + Object.keys(registry.computedEntries).length
    + Object.keys(registry.computedDependents).length
    + registry.deletingStores.size
    + registry.computedCleanups.size
    + countRequestRuntimeResiduals(registry);
};

const inspectSession = (
  suite: SuiteState,
  phase: string,
  requestId: number,
  boundary: string,
  trace: TraceEntry[],
): SessionState | null => {
  pushTrace(trace, boundary, "inspect");
  const carrier = getRequestCarrier() as { session?: SessionState } | null;
  const carrierSession = carrier?.session;
  const observed = _hasStoreEntryInternal("session")
    ? getStore("session") as SessionState | null
    : null;
  const expectedToken = `token-${requestId}`;

  let mismatch = false;
  let foreign = false;
  const notes: string[] = [];

  if (!carrierSession) {
    mismatch = true;
    notes.push("carrier missing");
  } else {
    if (carrierSession.requestId !== requestId) {
      mismatch = true;
      foreign = true;
      notes.push(`carrier request ${carrierSession.requestId}`);
    }
    if (carrierSession.token !== expectedToken) {
      mismatch = true;
      foreign = true;
      notes.push(`carrier token ${carrierSession.token}`);
    }
  }

  if (!observed) {
    mismatch = true;
    notes.push("store missing");
  } else {
    if (observed.requestId !== requestId) {
      mismatch = true;
      foreign = true;
      notes.push(`store request ${observed.requestId}`);
    }
    if (observed.token !== expectedToken) {
      mismatch = true;
      foreign = true;
      notes.push(`store token ${observed.token}`);
    }
  }

  if (foreign) {
    recordInvariantFailure(suite, "foreignReadCount", {
      phase,
      kind: "foreign-read",
      requestId,
      boundary,
      message: notes.join(", "),
      trace: cloneTrace(trace),
    });
  }

  if (mismatch) {
    recordInvariantFailure(suite, "contextMismatchCount", {
      phase,
      kind: "context-mismatch",
      requestId,
      boundary,
      message: notes.join(", "),
      trace: cloneTrace(trace),
    });
  }

  return observed;
};

const validateSessionSnapshot = (
  suite: SuiteState,
  phase: string,
  requestId: number,
  boundary: string,
  trace: TraceEntry[],
  snapshot: SessionState | undefined,
  shouldAbort: boolean,
): void => {
  const errors: string[] = [];

  if (!snapshot) {
    errors.push("snapshot missing");
  } else {
    if (snapshot.requestId !== requestId) {
      errors.push(`snapshot request ${snapshot.requestId}`);
    }
    if (snapshot.token !== `token-${requestId}`) {
      errors.push(`snapshot token ${snapshot.token}`);
    }
    if (snapshot.phase !== phase) {
      errors.push(`snapshot phase ${snapshot.phase}`);
    }
    if (JSON.stringify(snapshot.steps) !== JSON.stringify(["init", "db", "render"])) {
      errors.push(`snapshot steps ${JSON.stringify(snapshot.steps)}`);
    }
    if (snapshot.aborted !== shouldAbort) {
      errors.push(`snapshot aborted ${String(snapshot.aborted)}`);
    }
    if (snapshot.checksum !== (requestId * 100) + 2) {
      errors.push(`snapshot checksum ${snapshot.checksum}`);
    }
  }

  if (errors.length > 0) {
    recordInvariantFailure(suite, "contextMismatchCount", {
      phase,
      kind: "context-mismatch",
      requestId,
      boundary,
      message: errors.join(", "),
      trace: cloneTrace(trace),
    });
  }
};

const noteRequestResiduals = (
  suite: SuiteState,
  phase: string,
  requestId: number,
  trace: TraceEntry[],
  registry: StoreRegistry,
): void => {
  const subscriberResiduals = countRegistrySubscribers(registry);
  if (subscriberResiduals > 0) {
    suite.invariants.subscriberResidualCount += subscriberResiduals;
    recordFailure(suite, {
      phase,
      kind: "subscriber-residual",
      requestId,
      boundary: "request-registry:subscribers",
      message: `subscriber residuals ${subscriberResiduals}`,
      trace: cloneTrace(trace),
    });
  }

  const runtimeResiduals = countRequestRuntimeResiduals(registry);
  if (runtimeResiduals > 0) {
    suite.invariants.registryResidualCount += runtimeResiduals;
    recordFailure(suite, {
      phase,
      kind: "registry-residual",
      requestId,
      boundary: "request-registry:runtime",
      message: `runtime residuals ${runtimeResiduals}`,
      trace: cloneTrace(trace),
    });
  }
};

const ensureGlobalRegistryIntegrity = async (
  suite: SuiteState,
  phase: string,
): Promise<void> => {
  await flushRuntime(6);

  const stores = listStores();
  const health = getStoreHealth() as { registry?: { totalStores?: number } };
  const residualCount = countGlobalRegistryResiduals();

  if (stores.length > 0 || (health.registry?.totalStores ?? 0) > 0 || residualCount > 0) {
    const totalResiduals = residualCount + stores.length + (health.registry?.totalStores ?? 0);
    suite.invariants.registryResidualCount += totalResiduals;
    recordFailure(suite, {
      phase,
      kind: "registry-residual",
      boundary: "global-registry",
      message: `listStores=${JSON.stringify(stores)}, totalStores=${health.registry?.totalStores ?? 0}, residuals=${residualCount}`,
      trace: [],
    });
  }
};

const jitter = async (
  rng: () => number,
  trace: TraceEntry[],
  label: string,
): Promise<void> => {
  const roll = Math.floor(rng() * 4);
  if (roll === 0) {
    pushTrace(trace, label, "queueMicrotask:start");
    await nextMicrotask();
    pushTrace(trace, label, "queueMicrotask:end");
    return;
  }

  if (roll === 1) {
    pushTrace(trace, label, "setImmediate:start");
    await nextImmediate();
    pushTrace(trace, label, "setImmediate:end");
    return;
  }

  if (roll === 2) {
    const delayMs = Math.floor(rng() * 4);
    pushTrace(trace, label, "setTimeout:start", `delay=${delayMs}`);
    await wait(delayMs);
    pushTrace(trace, label, "setTimeout:end", `delay=${delayMs}`);
    return;
  }

  pushTrace(trace, label, "promise-chain:start");
  await Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve());
  pushTrace(trace, label, "promise-chain:end");
};

const runManualPromiseBoundary = async (
  suite: SuiteState,
  phase: string,
  requestId: number,
  trace: TraceEntry[],
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    pushTrace(trace, "manual-promise", "start");
    Promise.resolve()
      .then(() => {
        inspectSession(suite, phase, requestId, "manual-promise:depth-1", trace);
      })
      .then(() => Promise.resolve())
      .then(async () => {
        inspectSession(suite, phase, requestId, "manual-promise:depth-2", trace);
        await nextMicrotask();
        inspectSession(suite, phase, requestId, "manual-promise:depth-3", trace);
      })
      .then(() => {
        pushTrace(trace, "manual-promise", "end");
        resolve();
      })
      .catch(reject);
  });
};

const runThirdPartyWrapperBoundary = async (
  suite: SuiteState,
  phase: string,
  requestId: number,
  trace: TraceEntry[],
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    pushTrace(trace, "third-party-wrapper", "start");
    setImmediate(() => {
      Promise.resolve()
        .then(async () => {
          inspectSession(suite, phase, requestId, "third-party-wrapper:immediate", trace);
          await nextMicrotask();
          inspectSession(suite, phase, requestId, "third-party-wrapper:microtask", trace);
        })
        .then(() => {
          pushTrace(trace, "third-party-wrapper", "end");
          resolve();
        })
        .catch(reject);
    });
  });
};

const applySessionWrite = (
  requestId: number,
  label: string,
  shouldAbort = false,
): void => {
  setStore("session", (draft: SessionState) => {
    draft.steps.push(label);
    draft.checksum += 1;
    draft.aborted = shouldAbort;
    draft.boundaryTrail.push(label);
    draft.token = `token-${requestId}`;
  });
};

const runChaoticRequest = async (
  suite: SuiteState,
  phase: string,
  requestId: number,
  rng: () => number,
): Promise<{ durationMs: number; aborted: boolean }> => {
  const context = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", createSession(requestId, phase));
  });
  const trace: TraceEntry[] = [];
  const shouldAbort = requestId % ABORT_EVERY === 0;
  const startedAt = performance.now();
  let aborted = false;

  try {
    await context.hydrate(async () => {
      const off = subscribe("session", (snapshot) => {
        const observed = snapshot as SessionState | null;
        if (observed && observed.requestId !== requestId) {
          recordInvariantFailure(suite, "foreignReadCount", {
            phase,
            kind: "foreign-read",
            requestId,
            boundary: "subscription",
            message: `subscriber observed request ${observed.requestId}`,
            trace: cloneTrace(trace),
          });
        }
      });

      try {
        inspectSession(suite, phase, requestId, "start", trace);
        await jitter(rng, trace, "pre-db");
        inspectSession(suite, phase, requestId, "after-pre-db-jitter", trace);

        applySessionWrite(requestId, "db");
        inspectSession(suite, phase, requestId, "after-db-write", trace);

        await jitter(rng, trace, "mid-flight");
        inspectSession(suite, phase, requestId, "after-mid-flight-jitter", trace);

        await runManualPromiseBoundary(suite, phase, requestId, trace);
        await runThirdPartyWrapperBoundary(suite, phase, requestId, trace);

        await jitter(rng, trace, "pre-render");
        inspectSession(suite, phase, requestId, "before-render-write", trace);

        applySessionWrite(requestId, "render", shouldAbort);
        inspectSession(suite, phase, requestId, "after-render-write", trace);

        await jitter(rng, trace, "post-render");
        inspectSession(suite, phase, requestId, "after-post-render-jitter", trace);

        if (shouldAbort) {
          pushTrace(trace, "abort", "throw");
          throw new Error(`abort-${requestId}`);
        }
      } finally {
        off();
      }
    });
  } catch (error) {
    aborted = true;
    const message = error instanceof Error ? error.message : String(error);
    if (!shouldAbort || !message.includes(`abort-${requestId}`)) {
      recordFailure(suite, {
        phase,
        kind: "unexpected-error",
        requestId,
        boundary: "hydrate",
        message,
        trace: cloneTrace(trace),
      });
    }
  }

  if (shouldAbort && !aborted) {
    recordFailure(suite, {
      phase,
      kind: "unexpected-error",
      requestId,
      boundary: "abort",
      message: "expected abort did not occur",
      trace: cloneTrace(trace),
    });
  }

  const snapshot = context.snapshot().session as SessionState | undefined;
  validateSessionSnapshot(
    suite,
    phase,
    requestId,
    "snapshot",
    trace,
    snapshot,
    shouldAbort,
  );

  await context.hydrate(() => {
    validateSessionSnapshot(
      suite,
      phase,
      requestId,
      "replay",
      trace,
      getStore("session") as SessionState | undefined,
      shouldAbort,
    );
  });

  await flushRuntime(4);
  noteRequestResiduals(suite, phase, requestId, trace, context.registry);

  return {
    durationMs: round(performance.now() - startedAt),
    aborted,
  };
};

const runChaosCampaign = async (
  suite: SuiteState,
  name: string,
  seed: number,
  requestOffset: number,
): Promise<CampaignResult> => {
  const campaignViolationsBefore = suite.failureCount;
  const results = await Promise.all(
    Array.from({ length: CHAOS_REQUESTS }, (_value, index) => {
      const requestId = requestOffset + index + 1;
      const rng = createRng(seed + requestId);
      return runChaoticRequest(suite, name, requestId, rng);
    }),
  );

  await ensureGlobalRegistryIntegrity(suite, name);
  suite.maxConcurrentCorrectnessViolations = Math.max(
    suite.maxConcurrentCorrectnessViolations,
    suite.failureCount - campaignViolationsBefore,
  );

  const durations = results.map((result) => result.durationMs);
  const abortedRequests = results.filter((result) => result.aborted).length;

  return {
    name,
    seed,
    requests: CHAOS_REQUESTS,
    abortedRequests,
    timing: summarizeSamples(durations),
  };
};

const runSustainedPressure = async (
  suite: SuiteState,
  requestOffset: number,
): Promise<SustainedPressureResult> => {
  const phase = "sustained-pressure";
  const waveDurations: number[] = [];
  const requestDurations: number[] = [];
  let abortedRequests = 0;
  let nextRequestId = requestOffset;
  const violationsBefore = suite.failureCount;
  const startedAt = performance.now();

  for (let wave = 0; wave < SUSTAINED_WAVES; wave += 1) {
    const waveStartedAt = performance.now();
    const results = await Promise.all(
      Array.from({ length: SUSTAINED_CONCURRENCY }, (_value, index) => {
        const requestId = nextRequestId + index + 1;
        const rng = createRng(0xa11ce000 + (wave * 0x1000) + requestId);
        return runChaoticRequest(
          suite,
          `${phase}-wave-${wave + 1}`,
          requestId,
          rng,
        );
      }),
    );

    nextRequestId += SUSTAINED_CONCURRENCY;
    waveDurations.push(round(performance.now() - waveStartedAt));
    requestDurations.push(...results.map((result) => result.durationMs));
    abortedRequests += results.filter((result) => result.aborted).length;
    await ensureGlobalRegistryIntegrity(suite, `${phase}-wave-${wave + 1}`);
  }

  suite.maxConcurrentCorrectnessViolations = Math.max(
    suite.maxConcurrentCorrectnessViolations,
    suite.failureCount - violationsBefore,
  );

  const totalWallMs = round(performance.now() - startedAt);
  const totalRequests = SUSTAINED_WAVES * SUSTAINED_CONCURRENCY;

  return {
    name: "Sustained Pressure",
    waves: SUSTAINED_WAVES,
    concurrentPerWave: SUSTAINED_CONCURRENCY,
    totalRequests,
    abortedRequests,
    requestTiming: summarizeSamples(requestDurations),
    waveTiming: summarizeSamples(waveDurations),
    throughputRequestsPerSec: round(totalRequests / (totalWallMs / 1000)),
    totalWallMs,
  };
};

const runInterleavingPair = async (
  suite: SuiteState,
  pairIndex: number,
): Promise<number> => {
  const requestIdA = 100000 + (pairIndex * 2);
  const requestIdB = requestIdA + 1;
  const phase = "cross-request-interleaving";
  const requestA = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", createSession(requestIdA, phase));
  });
  const requestB = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", createSession(requestIdB, phase));
  });

  const traceA: TraceEntry[] = [];
  const traceB: TraceEntry[] = [];
  const aPaused = deferred<void>();
  const bFinished = deferred<void>();
  const startedAt = performance.now();

  await Promise.all([
    requestA.hydrate(async () => {
      inspectSession(suite, phase, requestIdA, "pair-a:start", traceA);
      applySessionWrite(requestIdA, "db");
      inspectSession(suite, phase, requestIdA, "pair-a:mid-update", traceA);
      aPaused.resolve();
      await bFinished.promise;
      applySessionWrite(requestIdA, "render");
      inspectSession(suite, phase, requestIdA, "pair-a:resume", traceA);
    }),
    requestB.hydrate(async () => {
      await aPaused.promise;
      inspectSession(suite, phase, requestIdB, "pair-b:start", traceB);
      applySessionWrite(requestIdB, "db");
      await nextImmediate();
      inspectSession(suite, phase, requestIdB, "pair-b:after-b-write", traceB);
      applySessionWrite(requestIdB, "render");
      inspectSession(suite, phase, requestIdB, "pair-b:finish", traceB);
      bFinished.resolve();
    }),
  ]);

  const snapshotA = requestA.snapshot().session as SessionState | undefined;
  const snapshotB = requestB.snapshot().session as SessionState | undefined;
  validateSessionSnapshot(suite, phase, requestIdA, "pair-a:snapshot", traceA, snapshotA, false);
  validateSessionSnapshot(suite, phase, requestIdB, "pair-b:snapshot", traceB, snapshotB, false);

  if (snapshotA?.steps.includes("render") && snapshotA.steps.includes("db")) {
    // Expected.
  } else {
    recordFailure(suite, {
      phase,
      kind: "context-mismatch",
      requestId: requestIdA,
      peerRequestId: requestIdB,
      boundary: "pair-a:steps",
      message: `unexpected A steps ${JSON.stringify(snapshotA?.steps ?? null)}`,
      trace: cloneTrace(traceA),
    });
  }

  if (snapshotB?.steps.includes("render") && snapshotB.steps.includes("db")) {
    // Expected.
  } else {
    recordFailure(suite, {
      phase,
      kind: "context-mismatch",
      requestId: requestIdB,
      peerRequestId: requestIdA,
      boundary: "pair-b:steps",
      message: `unexpected B steps ${JSON.stringify(snapshotB?.steps ?? null)}`,
      trace: cloneTrace(traceB),
    });
  }

  noteRequestResiduals(suite, phase, requestIdA, traceA, requestA.registry);
  noteRequestResiduals(suite, phase, requestIdB, traceB, requestB.registry);

  return round(performance.now() - startedAt);
};

const runCrossRequestInterleaving = async (
  suite: SuiteState,
): Promise<InterleavingResult> => {
  const violationsBefore = suite.failureCount;
  const durations = await Promise.all(
    Array.from({ length: INTERLEAVING_PAIRS }, (_value, index) =>
      runInterleavingPair(suite, index + 1)),
  );

  await ensureGlobalRegistryIntegrity(suite, "cross-request-interleaving");
  suite.maxConcurrentCorrectnessViolations = Math.max(
    suite.maxConcurrentCorrectnessViolations,
    suite.failureCount - violationsBefore,
  );

  return {
    name: "Cross-Request Interleaving",
    pairs: INTERLEAVING_PAIRS,
    requests: INTERLEAVING_PAIRS * 2,
    timing: summarizeSamples(durations),
  };
};

const buildDetachedProbe = (
  suite: SuiteState,
  phase: string,
  requestId: number,
  boundary: DetachedProbe["boundary"],
  trace: TraceEntry[],
): DetachedProbe => ({
  requestId,
  phase,
  boundary,
  trace: cloneTrace(trace),
  run: async () => {
    if (boundary === "detached-timeout") {
      await wait(1);
    } else if (boundary === "detached-immediate") {
      await nextImmediate();
    } else {
      await new Promise<void>((resolve, reject) => {
        setImmediate(() => {
          Promise.resolve()
            .then(resolve)
            .catch(reject);
        });
      });
    }

    const carrier = getRequestCarrier() as { session?: SessionState } | null;
    const snapshot = _hasStoreEntryInternal("session")
      ? getStore("session") as SessionState | null
      : null;

    if (carrier || snapshot) {
      recordInvariantFailure(suite, "postLifecycleAccessSuccess", {
        phase,
        kind: "post-lifecycle-access",
        requestId,
        boundary,
        message: `carrier=${JSON.stringify(carrier?.session ?? null)}, snapshot=${JSON.stringify(snapshot)}`,
        trace: cloneTrace(trace),
      });
    }
  },
});

const runLifecycleEscape = async (
  suite: SuiteState,
): Promise<LifecycleEscapeResult> => {
  const phase = "lifecycle-escape";
  const probes: DetachedProbe[] = [];
  const violationsBefore = suite.failureCount;

  const requestDurations = await Promise.all(
    Array.from({ length: LIFECYCLE_REQUESTS }, async (_value, index) => {
      const requestId = 200000 + index + 1;
      const context = createStoreForRequest<{ session: SessionState }>((api) => {
        api.create("session", createSession(requestId, phase));
      });
      const trace: TraceEntry[] = [];
      const startedAt = performance.now();

      await context.hydrate(async () => {
        inspectSession(suite, phase, requestId, "lifecycle:start", trace);
        applySessionWrite(requestId, "db");
        await runManualPromiseBoundary(suite, phase, requestId, trace);
        applySessionWrite(requestId, "render");
        inspectSession(suite, phase, requestId, "lifecycle:before-detach", trace);
        probes.push(
          buildDetachedProbe(suite, phase, requestId, "detached-timeout", trace),
          buildDetachedProbe(suite, phase, requestId, "detached-immediate", trace),
          buildDetachedProbe(suite, phase, requestId, "detached-third-party-wrapper", trace),
        );
      });

      validateSessionSnapshot(
        suite,
        phase,
        requestId,
        "lifecycle:snapshot",
        trace,
        context.snapshot().session as SessionState | undefined,
        false,
      );
      noteRequestResiduals(suite, phase, requestId, trace, context.registry);

      return round(performance.now() - startedAt);
    }),
  );

  await flushRuntime(6);

  await Promise.all(probes.map(async (probe) => {
    try {
      await probe.run();
    } catch (error) {
      recordFailure(suite, {
        phase: probe.phase,
        kind: "unexpected-error",
        requestId: probe.requestId,
        boundary: probe.boundary,
        message: error instanceof Error ? error.message : String(error),
        trace: cloneTrace(probe.trace),
      });
    }
  }));

  await ensureGlobalRegistryIntegrity(suite, phase);
  suite.maxConcurrentCorrectnessViolations = Math.max(
    suite.maxConcurrentCorrectnessViolations,
    suite.failureCount - violationsBefore,
  );

  return {
    name: "Lifecycle Escape",
    requests: LIFECYCLE_REQUESTS,
    probes: probes.length,
    timing: summarizeSamples(requestDurations),
  };
};

const runReactStreamingHttp = async (
  suite: SuiteState,
): Promise<ReactStreamingResult> => {
  const phase = "react-streaming-http";
  const requestMetrics = new Map<number, { shellMs: number; allReadyMs: number }>();
  const violationsBefore = suite.failureCount;
  const server = createServer(async (req, res) => {
    const trace: TraceEntry[] = [];
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const requestId = Number(url.searchParams.get("id") ?? 0);
      const context = createStoreForRequest<{ session: SessionState }>((api) => {
        api.create("session", createSession(requestId, phase));
      });
      const outer = createTextResource(
        "resolved-outer",
        requestId,
        1 + (requestId % 3),
      );
      const inner = createTextResource(
        "resolved-inner",
        requestId,
        3 + (requestId % 5),
      );
      const renderStartedAt = performance.now();
      let shellMs = 0;
      let allReadyMs = 0;

      await context.hydrate(async () => {
        inspectSession(suite, phase, requestId, "http:before-stream", trace);
        applySessionWrite(requestId, "db");
        inspectSession(suite, phase, requestId, "http:after-db", trace);
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let didPipe = false;
          const stream = renderToPipeableStream(
            React.createElement(StreamingApp, { requestId, outer, inner }),
            {
              onShellReady() {
                shellMs = round(performance.now() - renderStartedAt);
                res.statusCode = 200;
                res.setHeader("content-type", "text/html; charset=utf-8");
                didPipe = true;
                stream.pipe(res);
              },
              onAllReady() {
                allReadyMs = round(performance.now() - renderStartedAt);
              },
              onShellError(error) {
                if (settled) return;
                settled = true;
                reject(error);
              },
              onError(error) {
                if (!didPipe && !settled) {
                  settled = true;
                  reject(error);
                }
              },
            },
          );

          res.on("finish", () => {
            if (settled) return;
            settled = true;
            resolve();
          });
          res.on("close", () => {
            if (settled) return;
            settled = true;
            resolve();
          });
        });
        applySessionWrite(requestId, "render");
        inspectSession(suite, phase, requestId, "http:after-stream", trace);
      });

      requestMetrics.set(requestId, { shellMs, allReadyMs });
      validateSessionSnapshot(
        suite,
        phase,
        requestId,
        "http:snapshot",
        trace,
        context.snapshot().session as SessionState | undefined,
        false,
      );
      noteRequestResiduals(suite, phase, requestId, trace, context.registry);
    } catch (error) {
      recordFailure(suite, {
        phase,
        kind: "unexpected-error",
        boundary: "http-handler",
        message: error instanceof Error ? error.message : String(error),
        trace: cloneTrace(trace),
      });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
      }
      res.end("ssr-stream-error");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  const startedAt = performance.now();

  try {
    const responses = await Promise.all(
      Array.from({ length: REACT_STREAMING_REQUESTS }, async (_value, index) => {
        const requestId = 600000 + index + 1;
        const requestStartedAt = performance.now();
        const response = await fetch(`http://127.0.0.1:${port}/?id=${requestId}`);
        const body = await response.text();
        const durationMs = round(performance.now() - requestStartedAt);
        const bodyBytes = Buffer.byteLength(body);

        if (!response.ok) {
          recordFailure(suite, {
            phase,
            kind: "unexpected-error",
            requestId,
            boundary: "http-client",
            message: `status=${response.status} body=${body.slice(0, 160)}`,
            trace: [],
          });
        }

        const expectations = [
          `token-${requestId}`,
          `request-${requestId}`,
          `outer-${requestId}:resolved-outer-${requestId}`,
          `inner-${requestId}:resolved-inner-${requestId}`,
        ];

        const missing = expectations.filter((needle) => !body.includes(needle));
        if (missing.length > 0) {
          recordInvariantFailure(suite, "contextMismatchCount", {
            phase,
            kind: "context-mismatch",
            requestId,
            boundary: "http-response",
            message: `missing=${JSON.stringify(missing)} body=${body.slice(0, 240)}`,
            trace: [],
          });
        }

        return {
          requestId,
          durationMs,
          bodyBytes,
        };
      }),
    );

    await ensureGlobalRegistryIntegrity(suite, phase);
    suite.maxConcurrentCorrectnessViolations = Math.max(
      suite.maxConcurrentCorrectnessViolations,
      suite.failureCount - violationsBefore,
    );

    const responseDurations = responses.map((entry) => entry.durationMs);
    const shellDurations = responses.map((entry) =>
      requestMetrics.get(entry.requestId)?.shellMs ?? 0);
    const allReadyDurations = responses.map((entry) =>
      requestMetrics.get(entry.requestId)?.allReadyMs ?? 0);
    const responseBytes = responses.map((entry) => entry.bodyBytes);
    const sortedBytes = [...responseBytes].sort((left, right) => left - right);

    return {
      name: "React Streaming HTTP",
      requests: REACT_STREAMING_REQUESTS,
      concurrentRequests: REACT_STREAMING_REQUESTS,
      responseTiming: summarizeSamples(responseDurations),
      shellTiming: summarizeSamples(shellDurations),
      allReadyTiming: summarizeSamples(allReadyDurations),
      responseBytes: {
        median: sortedBytes.length === 0
          ? 0
          : sortedBytes[Math.floor(sortedBytes.length / 2)]!,
        p95: sortedBytes.length === 0
          ? 0
          : sortedBytes[Math.min(
            sortedBytes.length - 1,
            Math.ceil(sortedBytes.length * 0.95) - 1,
          )]!,
        max: sortedBytes.length === 0 ? 0 : sortedBytes[sortedBytes.length - 1]!,
      },
      totalWallMs: round(performance.now() - startedAt),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};

const runMemoryCycle = async (
  suite: SuiteState,
  requestId: number,
): Promise<void> => {
  const phase = "memory-stability";
  const context = createStoreForRequest<{
    session: SessionState & { payload: string[] };
  }>((api) => {
    api.create("session", {
      ...createSession(requestId, phase),
      payload: Array.from({ length: 8 }, (_value, index) =>
        `payload-${requestId}-${index}`.padEnd(96, "x")),
    });
  });

  const trace: TraceEntry[] = [];
  await context.hydrate(async () => {
    inspectSession(suite, phase, requestId, "memory:start", trace);
    applySessionWrite(requestId, "db");
    await nextMicrotask();
    inspectSession(suite, phase, requestId, "memory:mid", trace);
    applySessionWrite(requestId, "render");
    await Promise.resolve();
    inspectSession(suite, phase, requestId, "memory:end", trace);
  });

  noteRequestResiduals(suite, phase, requestId, trace, context.registry);
};

const linearRegressionSlope = (points: MemoryCheckpoint[]): number => {
  if (points.length < 2) return 0;
  const xs = points.map((point) => point.requests / 1000);
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
    if ((current.deltaMb - prev.deltaMb) > MONOTONIC_EPSILON_MB) {
      increases += 1;
    }
  }
  return increases;
};

const runMemoryStability = async (
  suite: SuiteState,
): Promise<MemoryResult> => {
  if (typeof global.gc !== "function") {
    throw new Error(
      "Run this benchmark with --expose-gc so SSR memory certification can measure retained heap.",
    );
  }

  let warmed = 0;
  while (warmed < MEMORY_WARMUP_CYCLES) {
    const batchSize = Math.min(MEMORY_BATCH_SIZE, MEMORY_WARMUP_CYCLES - warmed);
    await Promise.all(
      Array.from({ length: batchSize }, (_value, index) =>
        runMemoryCycle(suite, 250000 + warmed + index + 1)),
    );
    warmed += batchSize;
    await ensureGlobalRegistryIntegrity(suite, "memory-warmup");
  }

  await flushRuntime(8);
  maybeGc();
  const baselineHeap = heapMb();
  const checkpoints: MemoryCheckpoint[] = [];
  const durations: number[] = [];
  let completed = 0;

  while (completed < MEMORY_CYCLES) {
    const batchSize = Math.min(MEMORY_BATCH_SIZE, MEMORY_CYCLES - completed);
    const startedAt = performance.now();

    await Promise.all(
      Array.from({ length: batchSize }, (_value, index) =>
        runMemoryCycle(suite, 300000 + completed + index + 1)),
    );

    completed += batchSize;
    durations.push(round(performance.now() - startedAt));
    await ensureGlobalRegistryIntegrity(suite, "memory-stability");

    if ((completed % MEMORY_SAMPLE_EVERY) === 0 || completed === MEMORY_CYCLES) {
      maybeGc();
      const currentHeap = round(heapMb());
      checkpoints.push({
        requests: completed,
        heapMb: currentHeap,
        deltaMb: round(currentHeap - baselineHeap),
      });
    }
  }

  maybeGc();
  const finalHeap = heapMb();
  const retainedGrowthMb = round(finalHeap - baselineHeap);
  const peakDeltaMb = round(
    Math.max(
      0,
      ...checkpoints.map((checkpoint) => checkpoint.deltaMb),
      retainedGrowthMb,
    ),
  );
  const memoryGrowthSlopeMbPer1k = linearRegressionSlope(checkpoints);
  const monotonicIncreaseCount = countMonotonicIncreases(checkpoints);

  return {
    name: "Memory Stability",
    warmupCycles: MEMORY_WARMUP_CYCLES,
    cycles: MEMORY_CYCLES,
    batchSize: MEMORY_BATCH_SIZE,
    baselineHeapMb: round(baselineHeap),
    finalHeapMb: round(finalHeap),
    retainedGrowthMb,
    peakDeltaMb,
    memoryGrowthSlopeMbPer1k,
    monotonicIncreaseCount,
    timing: summarizeSamples(durations),
    checkpoints,
  };
};

const formatFailureSummary = (
  report: CertificationResult,
  reasons: string[],
): string => {
  const lines = [
    ...reasons,
    `timing median=${report.timing.medianMs}ms p95=${report.timing.p95Ms}ms`,
    `memory slope=${report.memoryStability.memoryGrowthSlopeMbPer1k} MB/1k retained=${report.memoryStability.retainedGrowthMb} MB`,
  ];

  report.failures.slice(0, 5).forEach((failure, index) => {
    lines.push(
      `failure ${index + 1}: phase=${failure.phase} kind=${failure.kind} request=${failure.requestId ?? "n/a"} boundary=${failure.boundary} message=${failure.message}`,
    );
    if (failure.trace.length > 0) {
      lines.push(
        `trace ${index + 1}: ${failure.trace.map((entry) =>
          `${entry.seq}:${entry.boundary}:${entry.event}:${entry.observedRequestId ?? "null"}/${entry.carrierRequestId ?? "null"}${entry.note ? `:${entry.note}` : ""}`).join(" | ")}`,
      );
    }
  });

  return lines.join("\n");
};

const assertCertification = (report: CertificationResult): void => {
  const reasons: string[] = [];

  if (report.invariants.foreignReadCount > 0) {
    reasons.push(`foreignReadCount=${report.invariants.foreignReadCount}`);
  }
  if (report.invariants.contextMismatchCount > 0) {
    reasons.push(`contextMismatchCount=${report.invariants.contextMismatchCount}`);
  }
  if (report.invariants.postLifecycleAccessSuccess > 0) {
    reasons.push(`postLifecycleAccessSuccess=${report.invariants.postLifecycleAccessSuccess}`);
  }
  if (report.invariants.registryResidualCount > 0) {
    reasons.push(`registryResidualCount=${report.invariants.registryResidualCount}`);
  }
  if (report.invariants.subscriberResidualCount > 0) {
    reasons.push(`subscriberResidualCount=${report.invariants.subscriberResidualCount}`);
  }
  if (report.invariants.globalStoreCountAfterRun > 0) {
    reasons.push(`globalStoreCountAfterRun=${report.invariants.globalStoreCountAfterRun}`);
  }
  if (report.memoryStability.memoryGrowthSlopeMbPer1k > MAX_MEMORY_SLOPE_MB_PER_1K) {
    reasons.push(
      `memoryGrowthSlopeMbPer1k=${report.memoryStability.memoryGrowthSlopeMbPer1k} exceeds ${MAX_MEMORY_SLOPE_MB_PER_1K}`,
    );
  }
  if (report.memoryStability.retainedGrowthMb > MAX_RETAINED_GROWTH_MB) {
    reasons.push(
      `retainedGrowthMb=${report.memoryStability.retainedGrowthMb} exceeds ${MAX_RETAINED_GROWTH_MB}`,
    );
  }

  if (reasons.length > 0) {
    throw new CertificationError(formatFailureSummary(report, reasons), report);
  }
};

export const runSsrIsolationBenchmark = async (): Promise<CertificationResult> => {
  resetAllStoresForTest();
  const startedAt = performance.now();
  const suite = createSuiteState();

  const chaosCampaigns: CampaignResult[] = [];
  let requestOffset = 0;

  for (let index = 0; index < CHAOS_SEEDS.length; index += 1) {
    const seed = CHAOS_SEEDS[index]!;
    chaosCampaigns.push(
      await runChaosCampaign(suite, `concurrency-chaos-${index + 1}`, seed, requestOffset),
    );
    requestOffset += CHAOS_REQUESTS;
  }

  const sustainedPressure = await runSustainedPressure(suite, requestOffset);
  requestOffset += sustainedPressure.totalRequests;
  const crossRequestInterleaving = await runCrossRequestInterleaving(suite);
  const lifecycleEscape = await runLifecycleEscape(suite);
  const reactStreamingHttp = await runReactStreamingHttp(suite);
  const memoryStability = await runMemoryStability(suite);

  await ensureGlobalRegistryIntegrity(suite, "suite-final");
  maybeGc();

  const finalGlobalStores = listStores();
  const combinedDurations = [
    ...chaosCampaigns.flatMap((campaign) => [
      campaign.timing.medianMs,
      campaign.timing.p95Ms,
      campaign.timing.maxMs,
    ]),
    sustainedPressure.requestTiming.medianMs,
    sustainedPressure.requestTiming.p95Ms,
    sustainedPressure.waveTiming.medianMs,
    sustainedPressure.waveTiming.p95Ms,
    crossRequestInterleaving.timing.medianMs,
    crossRequestInterleaving.timing.p95Ms,
    lifecycleEscape.timing.medianMs,
    lifecycleEscape.timing.p95Ms,
    reactStreamingHttp.responseTiming.medianMs,
    reactStreamingHttp.responseTiming.p95Ms,
    reactStreamingHttp.shellTiming.medianMs,
    reactStreamingHttp.allReadyTiming.p95Ms,
    ...(memoryStability.timing.count > 0
      ? [
        memoryStability.timing.medianMs,
        memoryStability.timing.p95Ms,
      ]
      : []),
  ];

  const result: CertificationResult = {
    name: "SSR Isolation Certification Suite",
    chaosCampaigns,
    sustainedPressure,
    crossRequestInterleaving,
    lifecycleEscape,
    reactStreamingHttp,
    memoryStability,
    requests: {
      concurrentPerCampaign: CHAOS_REQUESTS,
      chaosCampaigns: CHAOS_SEEDS.length,
      sustainedConcurrency: SUSTAINED_CONCURRENCY,
      sustainedWaves: SUSTAINED_WAVES,
      sustainedRequests: sustainedPressure.totalRequests,
      totalChaoticRequests: CHAOS_REQUESTS * CHAOS_SEEDS.length,
      interleavingRequests: INTERLEAVING_PAIRS * 2,
      lifecycleRequests: LIFECYCLE_REQUESTS,
      reactStreamingRequests: REACT_STREAMING_REQUESTS,
      memoryCycles: MEMORY_CYCLES,
    },
    timing: summarizeSamples(combinedDurations),
    totalWallMs: round(performance.now() - startedAt),
    invariants: {
      ...suite.invariants,
      maxConcurrentCorrectnessViolations: suite.maxConcurrentCorrectnessViolations,
      failureCount: suite.failureCount,
      globalStoreCountAfterRun: finalGlobalStores.length,
    },
    failures: suite.failures,
  };

  assertCertification(result);
  return result;
};

const main = async () => {
  try {
    const result = await runSsrIsolationBenchmark();
    emitReport({
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      result,
    });
  } catch (error) {
    const report = error instanceof CertificationError ? error.report : null;
    if (report) {
      emitReport({
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        result: report,
      });
    }
    console.error(error);
    process.exitCode = 1;
  }
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
