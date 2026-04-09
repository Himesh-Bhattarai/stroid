/**
 * SSR ALS Audit Ladder Benchmark
 * 
 * This benchmark performs a rigorous "ladder" of tests to certify that Stroid's 
 * AsyncLocalStorage (ALS) integration is robust across various Node.js async boundaries.
 * It validates:
 * 1. Context preservation across microtasks, timers, and MessageChannels.
 * 2. Correct behavior of pre-bound callbacks (manual hand-offs).
 * 3. Strict cleanup after request lifecycles to prevent memory leaks or cross-request pollution.
 */

import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { MessageChannel } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { createStoreForRequest } from "../../src/server/index.js";
import { getRequestCarrier } from "../../src/core/store-registry.js";
import { getStore, hasStore, setStore } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import {
  emitReport,
  isMainModule,
  round,
  summarizeSamples,
  wait,
} from "../guarantees/benchmark-guarantee-utils.js";

type Boundary =
  | "promise"
  | "nextTick"
  | "setImmediate"
  | "setTimeout"
  | "messagechannel";

type PreboundBoundary = "preboundMessageChannel" | "preboundEventEmitter";
type PostBoundary = "setImmediate" | "setTimeout" | "messagechannel";

type SessionState = {
  requestId: number;
  stamp: number;
};

type ProbeRecord = {
  requestId: number;
  boundary: string;
  phase: string;
  carrierRequestId: number | null;
  storeRequestId: number | null;
  nativeRequestId?: number | null;
  note?: string;
};

/**
 * Results for a specific stage of the audit ladder.
 */
type StageResult = {
  name: string;
  checks: number;
  failures: number;
  failuresByBoundary: Record<string, number>;
  timing: ReturnType<typeof summarizeSamples>;
  samples: ProbeRecord[];
};

/**
 * Aggregated benchmark report.
 */
type BenchmarkResult = {
  name: string;
  seed: number;
  requests: number;
  concurrentRequests: number;
  stages: StageResult[];
};

/**
 * Custom error thrown when a certification stage fails.
 */
class LadderCertificationError extends Error {
  report: BenchmarkResult;

  constructor(message: string, report: BenchmarkResult) {
    super(message);
    this.name = "LadderCertificationError";
    this.report = report;
  }
}

const REQUESTS = Number(process.env.STROID_ALS_AUDIT_REQUESTS ?? 32);
const CONCURRENT_REQUESTS = Number(process.env.STROID_ALS_AUDIT_CONCURRENT_REQUESTS ?? 64);
const TIMEOUT_MS = Number(process.env.STROID_ALS_AUDIT_TIMEOUT_MS ?? 2000);
const SEED = Number(process.env.STROID_ALS_AUDIT_SEED ?? Date.now());
const MAX_SAMPLES = 8;

const createRng = (seed: number) => () => {
  seed = ((seed * 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const rng = createRng(SEED);
const randomInt = (max: number): number => Math.floor(rng() * max);

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * Wraps a promise with a timeout.
 */
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> =>
  await Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    }),
  ]);

/**
 * Captures the current Stroid request context for validation.
 */
const readStroidContext = (): { carrierRequestId: number | null; storeRequestId: number | null } => {
  const carrier = getRequestCarrier() as { session?: SessionState } | null;
  const carrierRequestId = carrier?.session?.requestId ?? null;
  const storeRequestId = hasStore("session")
    ? ((getStore("session") as SessionState | null)?.requestId ?? null)
    : null;
  return {
    carrierRequestId,
    storeRequestId,
  };
};

const pushFailure = (
  failures: ProbeRecord[],
  failureCounts: Record<string, number>,
  entry: ProbeRecord,
): void => {
  failureCounts[entry.boundary] = (failureCounts[entry.boundary] ?? 0) + 1;
  if (failures.length < MAX_SAMPLES) failures.push(entry);
};

/**
 * Executes a callback within a specific async boundary.
 */
const runBoundary = async (
  boundary: Boundary,
  callback: () => void | Promise<void>,
): Promise<void> => {
  if (boundary === "promise") {
    await Promise.resolve().then(callback);
    return;
  }

  if (boundary === "nextTick") {
    await new Promise<void>((resolve, reject) => {
      process.nextTick(() => {
        Promise.resolve(callback()).then(resolve, reject);
      });
    });
    return;
  }

  if (boundary === "setImmediate") {
    await new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        Promise.resolve(callback()).then(resolve, reject);
      });
    });
    return;
  }

  if (boundary === "setTimeout") {
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        Promise.resolve(callback()).then(resolve, reject);
      }, 0);
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.on("message", () => {
      Promise.resolve(callback())
        .then(() => {
          channel.port1.close();
          channel.port2.close();
          resolve();
        })
        .catch((error) => {
          channel.port1.close();
          channel.port2.close();
          reject(error);
        });
    });
    channel.port2.postMessage("go");
  });
};

/**
 * Establishes a baseline using Node's native AsyncLocalStorage.
 */
const runNativeAlsBaseline = async (requestCount: number): Promise<StageResult> => {
  const nativeAls = new AsyncLocalStorage<{ requestId: number }>();
  const boundaries: Boundary[] = ["promise", "nextTick", "setImmediate", "setTimeout", "messagechannel"];
  const durations: number[] = [];
  const failures: ProbeRecord[] = [];
  const failuresByBoundary: Record<string, number> = {};
  let checks = 0;

  for (let requestId = 1; requestId <= requestCount; requestId += 1) {
    const startedAt = performance.now();
    await nativeAls.run({ requestId }, async () => {
      for (const boundary of boundaries) {
        await runBoundary(boundary, () => {
          checks += 1;
          const nativeRequestId = nativeAls.getStore()?.requestId ?? null;
          if (nativeRequestId !== requestId) {
            pushFailure(failures, failuresByBoundary, {
              requestId,
              boundary,
              phase: "native-in-scope",
              carrierRequestId: null,
              storeRequestId: null,
              nativeRequestId,
            });
          }
        });
      }
    });
    durations.push(round(performance.now() - startedAt));
  }

  return {
    name: "Native ALS Baseline",
    checks,
    failures: Object.values(failuresByBoundary).reduce((sum, value) => sum + value, 0),
    failuresByBoundary,
    timing: summarizeSamples(durations),
    samples: failures,
  };
};

/**
 * Validates that Stroid preserves context across standard async boundaries.
 */
const runStroidInScopeBoundaries = async (requestCount: number): Promise<StageResult> => {
  resetAllStoresForTest();
  const boundaries: Boundary[] = ["promise", "nextTick", "setImmediate", "setTimeout", "messagechannel"];
  const durations: number[] = [];
  const failures: ProbeRecord[] = [];
  const failuresByBoundary: Record<string, number> = {};
  let checks = 0;

  for (let requestId = 1; requestId <= requestCount; requestId += 1) {
    const startedAt = performance.now();
    const context = createStoreForRequest<{ session: SessionState }>((api) => {
      api.create("session", { requestId, stamp: 0 });
    });
    await context.hydrate(async () => {
      for (const boundary of boundaries) {
        await runBoundary(boundary, () => {
          checks += 1;
          const probe = readStroidContext();
          if (probe.carrierRequestId !== requestId || probe.storeRequestId !== requestId) {
            pushFailure(failures, failuresByBoundary, {
              requestId,
              boundary,
              phase: "stroid-in-scope",
              carrierRequestId: probe.carrierRequestId,
              storeRequestId: probe.storeRequestId,
            });
          }
          setStore("session", (draft: SessionState) => {
            draft.stamp += 1;
          });
        });
      }
    });
    assert.strictEqual(hasStore("session"), false, "request scope leaked session store");
    durations.push(round(performance.now() - startedAt));
  }

  return {
    name: "Stroid In-Scope Boundary Matrix",
    checks,
    failures: Object.values(failuresByBoundary).reduce((sum, value) => sum + value, 0),
    failuresByBoundary,
    timing: summarizeSamples(durations),
    samples: failures,
  };
};

/**
 * Creates a test harness for triggering callbacks that were bound 
 * to a specific request context.
 */
const createPreboundHarness = () => {
  const emitter = new EventEmitter();
  const channel = new MessageChannel();
  const callbacks = new Map<string, () => void>();

  const runCallback = (key: string): void => {
    const callback = callbacks.get(key);
    if (!callback) return;
    callbacks.delete(key);
    callback();
  };

  emitter.on("probe", (payload: { key: string }) => {
    runCallback(payload.key);
  });
  channel.port1.on("message", (payload: { key: string }) => {
    runCallback(payload.key);
  });

  const trigger = (
    key: string,
    boundary: PreboundBoundary,
  ): void => {
    if (boundary === "preboundEventEmitter") {
      emitter.emit("probe", { key });
      return;
    }
    channel.port2.postMessage({ key });
  };

  const register = (key: string, callback: () => void): void => {
    callbacks.set(key, callback);
  };

  const unregister = (key: string): void => {
    callbacks.delete(key);
  };

  const dispose = (): void => {
    emitter.removeAllListeners();
    channel.port1.close();
    channel.port2.close();
    callbacks.clear();
  };

  return { register, unregister, trigger, dispose };
};

/**
 * Validates that manually bound callbacks correctly restore the request context.
 */
const runStroidPreboundCallbacks = async (requestCount: number): Promise<StageResult> => {
  resetAllStoresForTest();
  const boundaries: PreboundBoundary[] = ["preboundMessageChannel", "preboundEventEmitter"];
  const durations: number[] = [];
  const failures: ProbeRecord[] = [];
  const failuresByBoundary: Record<string, number> = {};
  let checks = 0;
  const harness = createPreboundHarness();

  try {
    for (let requestId = 1; requestId <= requestCount; requestId += 1) {
      const startedAt = performance.now();
      const context = createStoreForRequest<{ session: SessionState }>((api) => {
        api.create("session", { requestId, stamp: 0 });
      });
      await context.hydrate(async () => {
        for (const boundary of boundaries) {
          const key = `${requestId}:${boundary}:${randomInt(1_000_000)}`;
          const pending = deferred<{ carrierRequestId: number | null; storeRequestId: number | null }>();
          const boundCallback = context.bind(() => {
            pending.resolve(readStroidContext());
          });
          harness.register(key, boundCallback);
          harness.trigger(key, boundary);
          const probe = await withTimeout(pending.promise, TIMEOUT_MS, `prebound timeout ${key}`);
          harness.unregister(key);
          checks += 1;
          if (probe.carrierRequestId !== requestId || probe.storeRequestId !== requestId) {
            pushFailure(failures, failuresByBoundary, {
              requestId,
              boundary,
              phase: "stroid-prebound-in-scope",
              carrierRequestId: probe.carrierRequestId,
              storeRequestId: probe.storeRequestId,
            });
          }
        }
      });
      assert.strictEqual(hasStore("session"), false, "request scope leaked session store");
      durations.push(round(performance.now() - startedAt));
    }
  } finally {
    harness.dispose();
  }

  return {
    name: "Stroid Pre-Bound Callback Matrix",
    checks,
    failures: Object.values(failuresByBoundary).reduce((sum, value) => sum + value, 0),
    failuresByBoundary,
    timing: summarizeSamples(durations),
    samples: failures,
  };
};

/**
 * Validates that request state is NOT accessible after the hydration scope has closed.
 */
const runStroidPostScopeLeakCheck = async (requestCount: number): Promise<StageResult> => {
  resetAllStoresForTest();
  const boundaries: PostBoundary[] = ["setImmediate", "setTimeout", "messagechannel"];
  const durations: number[] = [];
  const failures: ProbeRecord[] = [];
  const failuresByBoundary: Record<string, number> = {};
  let checks = 0;

  for (let requestId = 1; requestId <= requestCount; requestId += 1) {
    const startedAt = performance.now();
    const context = createStoreForRequest<{ session: SessionState }>((api) => {
      api.create("session", { requestId, stamp: 0 });
    });
    const deferreds: Array<Promise<{ boundary: PostBoundary; carrierRequestId: number | null; storeRequestId: number | null }>> = [];

    await context.hydrate(async () => {
      boundaries.forEach((boundary) => {
        const pending = deferred<{ boundary: PostBoundary; carrierRequestId: number | null; storeRequestId: number | null }>();
        deferreds.push(pending.promise);

        if (boundary === "setImmediate") {
          setImmediate(() => {
            pending.resolve({ boundary, ...readStroidContext() });
          });
          return;
        }

        if (boundary === "setTimeout") {
          setTimeout(() => {
            pending.resolve({ boundary, ...readStroidContext() });
          }, 0);
          return;
        }

        const channel = new MessageChannel();
        channel.port1.on("message", () => {
          pending.resolve({ boundary, ...readStroidContext() });
          channel.port1.close();
          channel.port2.close();
        });
        channel.port2.postMessage("post");
      });
    });

    const probes = await withTimeout(
      Promise.all(deferreds),
      TIMEOUT_MS,
      `post-scope timeout request ${requestId}`,
    );

    for (const probe of probes) {
      checks += 1;
      if (probe.carrierRequestId !== null || probe.storeRequestId !== null) {
        pushFailure(failures, failuresByBoundary, {
          requestId,
          boundary: probe.boundary,
          phase: "stroid-post-scope",
          carrierRequestId: probe.carrierRequestId,
          storeRequestId: probe.storeRequestId,
        });
      }
    }

    assert.strictEqual(hasStore("session"), false, "post-scope cleanup leaked session store");
    durations.push(round(performance.now() - startedAt));
  }

  return {
    name: "Stroid Post-Scope Leak Check",
    checks,
    failures: Object.values(failuresByBoundary).reduce((sum, value) => sum + value, 0),
    failuresByBoundary,
    timing: summarizeSamples(durations),
    samples: failures,
  };
};

/**
 * Validates context isolation under concurrent request pressure.
 */
const runConcurrentContentionCheck = async (requestCount: number): Promise<StageResult> => {
  resetAllStoresForTest();
  const durations: number[] = [];
  const failures: ProbeRecord[] = [];
  const failuresByBoundary: Record<string, number> = {};
  let checks = 0;

  await Promise.all(
    Array.from({ length: requestCount }, async (_value, index) => {
      const requestId = index + 1;
      await wait(randomInt(8));
      const startedAt = performance.now();
      const context = createStoreForRequest<{ session: SessionState }>((api) => {
        api.create("session", { requestId, stamp: 0 });
      });

      await context.hydrate(async () => {
        await runBoundary("messagechannel", () => {
          checks += 1;
          const probe = readStroidContext();
          if (probe.carrierRequestId !== requestId || probe.storeRequestId !== requestId) {
            pushFailure(failures, failuresByBoundary, {
              requestId,
              boundary: "messagechannel",
              phase: "stroid-concurrent",
              carrierRequestId: probe.carrierRequestId,
              storeRequestId: probe.storeRequestId,
            });
          }
        });

        await runBoundary("setImmediate", () => {
          checks += 1;
          const probe = readStroidContext();
          if (probe.carrierRequestId !== requestId || probe.storeRequestId !== requestId) {
            pushFailure(failures, failuresByBoundary, {
              requestId,
              boundary: "setImmediate",
              phase: "stroid-concurrent",
              carrierRequestId: probe.carrierRequestId,
              storeRequestId: probe.storeRequestId,
            });
          }
        });
      });

      assert.strictEqual(hasStore("session"), false, "concurrency scope leaked session store");
      durations.push(round(performance.now() - startedAt));
    }),
  );

  return {
    name: "Stroid Concurrent Cross-Request Check",
    checks,
    failures: Object.values(failuresByBoundary).reduce((sum, value) => sum + value, 0),
    failuresByBoundary,
    timing: summarizeSamples(durations),
    samples: failures,
  };
};

/**
 * Main entry point for the SSR ALS Audit Ladder.
 */
export const runSsrAlsAuditLadderBenchmark = async (): Promise<BenchmarkResult> => {
  const stages = [
    await runNativeAlsBaseline(REQUESTS),
    await runStroidInScopeBoundaries(REQUESTS),
    await runStroidPreboundCallbacks(REQUESTS),
    await runStroidPostScopeLeakCheck(REQUESTS),
    await runConcurrentContentionCheck(CONCURRENT_REQUESTS),
  ];

  const report: BenchmarkResult = {
    name: "SSR ALS Audit Ladder Benchmark",
    seed: SEED,
    requests: REQUESTS,
    concurrentRequests: CONCURRENT_REQUESTS,
    stages,
  };

  const firstFailure = stages.find((stage) => stage.failures > 0);
  if (firstFailure) {
    throw new LadderCertificationError(
      `ALS ladder failed at "${firstFailure.name}": ${JSON.stringify(firstFailure.samples[0] ?? null)}`,
      report,
    );
  }

  return report;
};

const main = async () => {
  try {
    const result = await runSsrAlsAuditLadderBenchmark();
    emitReport({
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      result,
    });
  } catch (error) {
    if (error instanceof LadderCertificationError) {
      emitReport({
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        result: error.report,
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
