/**
 * SSR Gap Coverage Benchmark
 * 
 * This benchmark targets "edge cases" in the SSR lifecycle where state might leak or 
 * become detached, specifically focusing on:
 * 1. AsyncLocalStorage (ALS) context preservation across complex event loop hops.
 * 2. Portable scope isolation when multiple request types (Render vs Action) overlap.
 * 3. Cleanup verification for worker-like environments (Cloudflare/Vercel Edge).
 */

import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { Writable } from "node:stream";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import {
  createStoreForRequest,
} from "../../src/server/index.js";
import { createRequestScope } from "../../src/server/portable.js";
import {
  getRequestCarrier,
} from "../../src/core/store-registry.js";
import {
  getStore,
  hasStore,
  setStore,
} from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import {
  emitReport,
  heapMb,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
  wait,
} from "../guarantees/benchmark-guarantee-utils.js";

/**
 * State shape used for tracking request lifecycle and mutations.
 */
type SessionState = {
  requestId: number;
  user: string;
  phase: string;
  logs: string[];
  revision: number;
};

type ProbeEmissionKind =
  | "messagechannel"
  | "setImmediate"
  | "nextTick"
  | "setTimeout";

type ProbeEntry = {
  expectedRequestId: number;
  emissionKind: ProbeEmissionKind;
  phaseToken: string;
  carrierRequestId: number | null;
  storeRequestId: number | null;
};

/**
 * Result of a specific gap test suite.
 */
type GapResult = {
  name: string;
  size: number;
  checks: number;
  isolationFailures: number;
  injectedErrors: number;
  timing: ReturnType<typeof summarizeSamples>;
  successTiming: ReturnType<typeof summarizeSamples>;
  failureTiming: ReturnType<typeof summarizeSamples>;
  detail?: string;
};

/**
 * Aggregated benchmark report.
 */
type BenchmarkResult = {
  name: string;
  sizes: number[];
  preboundAls: GapResult[];
  preboundPortable: GapResult[];
  midStreamActionOverlap: GapResult[];
  workerPostLifecycle: GapResult[];
  heapDeltaMb: number;
  heapCheckpoints: Record<string, number>;
  seed: number;
  heapSpikeMb: number;
  retainedReleaseMb: number;
};

/**
 * Parses environment variables for concurrency levels.
 */
const parseSizeList = (value: string | undefined, fallback: number[]): number[] => {
  if (!value) return fallback;
  const parsed = value.split(",").map((entry) => Number(entry.trim())).filter((num) => Number.isFinite(num) && num > 0);
  return parsed.length > 0 ? parsed : fallback;
};

const createRng = (seed: number) => () => {
  seed = ((seed * 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const SEED = Number(process.env.STROID_SSR_GAP_SEED ?? Date.now());
const rng = createRng(SEED);
const randomInt = (max: number): number => Math.floor(rng() * max);
const randomChance = (probability: number): boolean => rng() < probability;

const SIZE_LEVELS = parseSizeList(
  process.env.STROID_SSR_GAP_SIZES,
  [16, 32, 64, 128],
);

const PREBOUND_REQUESTS = Number(process.env.STROID_SSR_GAP_PREBOUND_REQUESTS ?? 32);
const OVERLAP_REQUESTS = Number(process.env.STROID_SSR_GAP_OVERLAP_REQUESTS ?? 24);
const WORKER_REQUESTS = Number(process.env.STROID_SSR_GAP_WORKER_REQUESTS ?? 48);
const MAX_HEAP_DELTA_MB = Number(process.env.STROID_SSR_GAP_MAX_HEAP_DELTA_MB ?? 12);
const MAX_PROBE_DRAIN_MS = Number(process.env.STROID_SSR_GAP_MAX_PROBE_DRAIN_MS ?? 2500);
const PROBE_BARRIER_TIMEOUT_MS = Number(process.env.STROID_SSR_GAP_PROBE_BARRIER_TIMEOUT_MS ?? 2000);

/**
 * Mimics non-deterministic async delays found in real-world I/O.
 */
const jitter = async (): Promise<void> => {
  // chained boundaries to mimic real event-loop hops
  await Promise.resolve();
  await wait(0);
  await wait(randomInt(5));
  await Promise.all([wait(randomInt(4)), wait(randomInt(4)), wait(randomInt(4))]);
  if (randomChance(0.1)) {
    await deepAsync(10 + randomInt(20));
  }
  if (randomChance(0.05)) {
    await wait(50 + randomInt(100)); // occasional long-tail latency
  }
};

const deepAsync = async (depth: number): Promise<void> => {
  if (depth <= 0) return;
  await Promise.resolve();
  await deepAsync(depth - 1);
};

const isInjectedChaosError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes("injected failure")
    || lower.includes("abort")
    || lower.includes("cancel");
};

const waitForProbeDrain = async (
  getCount: () => number,
  expected: number,
): Promise<boolean> => {
  const deadline = Date.now() + MAX_PROBE_DRAIN_MS;
  while (getCount() < expected && Date.now() < deadline) {
    await wait(1);
    await Promise.resolve();
  }
  return getCount() >= expected;
};

const waitForProbeBarrier = async (
  seenKinds: Set<ProbeEmissionKind>,
  expectedKinds: readonly ProbeEmissionKind[],
  requestId: number,
): Promise<void> => {
  const deadline = Date.now() + PROBE_BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (seenKinds.size >= expectedKinds.length) return;
    await wait(1);
    await Promise.resolve();
  }
  const missing = expectedKinds.filter((kind) => !seenKinds.has(kind));
  throw new Error(`Probe barrier timeout for request ${requestId}, missing=${missing.join(",")}`);
};

const summarizeProbeFailuresByEmission = (entries: ProbeEntry[]): Record<ProbeEmissionKind, number> => {
  const summary: Record<ProbeEmissionKind, number> = {
    messagechannel: 0,
    setImmediate: 0,
    nextTick: 0,
    setTimeout: 0,
  };
  entries.forEach((entry) => {
    summary[entry.emissionKind] += 1;
  });
  return summary;
};

const buildSession = (requestId: number, phase: string): SessionState => ({
  requestId,
  user: `user-${requestId}`,
  phase,
  logs: ["seed"],
  revision: 0,
});

/**
 * Captures the current state of both the internal carrier and the public store.
 */
const recordContext = (): {
  carrierRequestId: number | null;
  storeRequestId: number | null;
} => {
  const carrier = getRequestCarrier() as { session?: SessionState } | null;
  const carrierRequestId = carrier?.session?.requestId ?? null;
  const storeRequestId = hasStore("session")
    ? (getStore("session") as SessionState | null)?.requestId ?? null
    : null;
  return { carrierRequestId, storeRequestId };
};

/**
 * Tests if resources bound to the event loop (via MessageChannel) correctly 
 * resolve back to the original AsyncLocalStorage context.
 */
const runPreboundAlsHazard = async (
  requestCount: number,
  retainedSnapshots: unknown[],
): Promise<GapResult> => {
  const expectedKinds: readonly ProbeEmissionKind[] = [
    "messagechannel",
    "setImmediate",
    "nextTick",
    "setTimeout",
  ];
  const probes: ProbeEntry[] = [];
  const channels: MessageChannel[] = [];

  const durations: number[] = [];
  const injectedErrors: string[] = [];
  const unexpectedErrors: string[] = [];
  const injectedRequestIds = new Set<number>();
  const successDurations: number[] = [];
  const failureDurations: number[] = [];
  await Promise.all(
    Array.from({ length: requestCount }, async (_value, index) => {
      await wait(randomInt(20)); // introduce skew before each request starts
      const requestId = index + 1;
      const channel = new MessageChannel();
      channels.push(channel);
      const request = createStoreForRequest<{ session: SessionState }>((api) => {
        api.create("session", buildSession(requestId, "prebound-als"));
      });
      const startedAt = performance.now();
      const seenKinds = new Set<ProbeEmissionKind>();

      const onMessage = request.bind(async (message: {
        requestId: number;
        emissionKind: ProbeEmissionKind;
      }) => {
        await Promise.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
        await wait(0);
        await Promise.resolve();
        await wait(randomInt(10));
        const context = recordContext();
        probes.push({
          expectedRequestId: message.requestId,
          emissionKind: message.emissionKind,
          phaseToken: `req-${message.requestId}:${message.emissionKind}`,
          carrierRequestId: context.carrierRequestId,
          storeRequestId: context.storeRequestId,
        });
        seenKinds.add(message.emissionKind);
      });
      channel.port1.on("message", onMessage);
      if (typeof channel.port1.unref === "function") channel.port1.unref();
      if (typeof channel.port2.unref === "function") channel.port2.unref();

      try {
        await request.hydrate(async () => {
          // ensure some mutation happens after enqueue
          setStore("session", (draft: SessionState) => {
            draft.logs.push("hydrate-start");
            draft.revision += 1;
            draft.logs.push("x".repeat(512));
          });
          await jitter();
          channel.port2.postMessage({
            requestId,
            emissionKind: "messagechannel" satisfies ProbeEmissionKind,
          });
          setImmediate(() => channel.port2.postMessage({
            requestId,
            emissionKind: "setImmediate" satisfies ProbeEmissionKind,
          }));
          process.nextTick(() => channel.port2.postMessage({
            requestId,
            emissionKind: "nextTick" satisfies ProbeEmissionKind,
          }));
          setTimeout(() => channel.port2.postMessage({
            requestId,
            emissionKind: "setTimeout" satisfies ProbeEmissionKind,
          }), 0);
          await waitForProbeBarrier(seenKinds, expectedKinds, requestId);
          await jitter();
          await Promise.all([jitter(), jitter(), jitter()]);
          if (randomChance(0.1)) {
            throw new Error("Injected failure during ALS hydrate");
          }
          setStore("session", (draft: SessionState) => {
            draft.logs.push("hydrate-end");
            draft.revision += 1;
            draft.logs.push("x".repeat(512));
          });
        });
        successDurations.push(round(performance.now() - startedAt));
      } catch (error) {
        const message = `req ${requestId} hydrate error: ${(error as Error).message}`;
        if (isInjectedChaosError(message)) {
          injectedErrors.push(message);
          injectedRequestIds.add(requestId);
        } else {
          unexpectedErrors.push(message);
        }
        failureDurations.push(round(performance.now() - startedAt));
      } finally {
        retainedSnapshots.push(request.snapshot());
        durations.push(round(performance.now() - startedAt));
        // sanity: request should have cleaned up
        assert.strictEqual(hasStore("session"), false, "ALS request left session store attached");
        channel.port1.off("message", onMessage);
      }
    }),
  );

  const expectedProbes = requestCount * 4;
  const probeDrainComplete = await waitForProbeDrain(() => probes.length, expectedProbes);
  const probeDeficit = probeDrainComplete ? 0 : Math.max(0, expectedProbes - probes.length);
  channels.forEach((channel) => {
    channel.port1.close();
    channel.port2.close();
  });
  const failures = probes.filter((probe) =>
    !injectedRequestIds.has(probe.expectedRequestId)
    && (
    probe.carrierRequestId !== probe.expectedRequestId
    || probe.storeRequestId !== probe.expectedRequestId
    ));
  const validatedChecks = (requestCount - injectedRequestIds.size) * 4;

  return {
    name: "Pre-bound async resource uses correct ALS context",
    size: requestCount,
    checks: validatedChecks,
    isolationFailures: failures.length + probeDeficit + unexpectedErrors.length,
    injectedErrors: injectedErrors.length,
    detail: failures.length > 0 || injectedErrors.length > 0 || unexpectedErrors.length > 0 || probeDeficit > 0
      ? JSON.stringify({
        probeFailures: failures.slice(0, 3),
        probeFailuresByEmission: summarizeProbeFailuresByEmission(failures),
        injectedErrors: injectedErrors.slice(0, 3),
        unexpectedErrors: unexpectedErrors.slice(0, 3),
        expectedProbes,
        observedProbes: probes.length,
      })
      : undefined,
    timing: summarizeSamples(durations),
    successTiming: summarizeSamples(successDurations),
    failureTiming: summarizeSamples(failureDurations),
  };
};

/**
 * Tests if portable scopes (which don't rely on ALS) correctly isolate 
 * async callbacks triggered from outside the scope's execution block.
 */
const runPreboundPortableHazard = async (
  requestCount: number,
): Promise<GapResult> => {
  const expectedKinds: readonly ProbeEmissionKind[] = [
    "messagechannel",
    "setImmediate",
    "nextTick",
    "setTimeout",
  ];
  const probes: ProbeEntry[] = [];
  const channels: MessageChannel[] = [];

  const durations: number[] = [];
  const injectedErrors: string[] = [];
  const unexpectedErrors: string[] = [];
  const injectedRequestIds = new Set<number>();
  const successDurations: number[] = [];
  const failureDurations: number[] = [];
  await Promise.all(
    Array.from({ length: requestCount }, async (_value, index) => {
      await wait(randomInt(20)); // skew start
      const requestId = 10_000 + index + 1;
      const channel = new MessageChannel();
      channels.push(channel);
      const scope = createRequestScope<{ session: SessionState }>({
        snapshot: {
          session: buildSession(requestId, "prebound-portable"),
        },
        options: {},
      });
      const startedAt = performance.now();
      const seenKinds = new Set<ProbeEmissionKind>();

      const onMessage = scope.bind(async (message: {
        requestId: number;
        emissionKind: ProbeEmissionKind;
      }) => {
        await wait(randomInt(10));
        const context = recordContext();
        probes.push({
          expectedRequestId: message.requestId,
          emissionKind: message.emissionKind,
          phaseToken: `req-${message.requestId}:${message.emissionKind}`,
          carrierRequestId: context.carrierRequestId,
          storeRequestId: context.storeRequestId,
        });
        seenKinds.add(message.emissionKind);
      });
      channel.port1.on("message", onMessage);
      if (typeof channel.port1.unref === "function") channel.port1.unref();
      if (typeof channel.port2.unref === "function") channel.port2.unref();

      try {
        await scope.run(async (api) => {
          api.set("session", (draft) => {
            draft.logs.push("portable-start");
            draft.revision += 1;
            draft.logs.push("x".repeat(512));
          });
          await jitter();
          channel.port2.postMessage({
            requestId,
            emissionKind: "messagechannel" satisfies ProbeEmissionKind,
          });
          setImmediate(() => channel.port2.postMessage({
            requestId,
            emissionKind: "setImmediate" satisfies ProbeEmissionKind,
          }));
          process.nextTick(() => channel.port2.postMessage({
            requestId,
            emissionKind: "nextTick" satisfies ProbeEmissionKind,
          }));
          setTimeout(() => channel.port2.postMessage({
            requestId,
            emissionKind: "setTimeout" satisfies ProbeEmissionKind,
          }), 0);
          await waitForProbeBarrier(seenKinds, expectedKinds, requestId);
          await jitter();
          await Promise.all([jitter(), jitter(), jitter()]);
          if (randomChance(0.1)) {
            throw new Error("Injected failure during portable run");
          }
          api.set("session", (draft) => {
            draft.logs.push("portable-end");
            draft.revision += 1;
            draft.logs.push("x".repeat(512));
          });
        });
        successDurations.push(round(performance.now() - startedAt));
      } catch (error) {
        const message = `req ${requestId} portable error: ${(error as Error).message}`;
        if (isInjectedChaosError(message)) {
          injectedErrors.push(message);
          injectedRequestIds.add(requestId);
        } else {
          unexpectedErrors.push(message);
        }
        failureDurations.push(round(performance.now() - startedAt));
      } finally {
        channel.port1.off("message", onMessage);
      }

      durations.push(round(performance.now() - startedAt));
    }),
  );

  const expectedProbes = requestCount * 4;
  const probeDrainComplete = await waitForProbeDrain(() => probes.length, expectedProbes);
  const probeDeficit = probeDrainComplete ? 0 : Math.max(0, expectedProbes - probes.length);
  channels.forEach((channel) => {
    channel.port1.close();
    channel.port2.close();
  });
  const failures = probes.filter((probe) => {
    if (injectedRequestIds.has(probe.expectedRequestId)) return false;
    const carrierOk = probe.carrierRequestId === null
      || probe.carrierRequestId === probe.expectedRequestId;
    const storeOk = probe.storeRequestId === null
      || probe.storeRequestId === probe.expectedRequestId;
    return !(carrierOk && storeOk);
  });
  const validatedChecks = (requestCount - injectedRequestIds.size) * 4;

  return {
    name: "Pre-bound async resource does not bleed portable scope",
    size: requestCount,
    checks: validatedChecks,
    isolationFailures: failures.length + probeDeficit + unexpectedErrors.length,
    injectedErrors: injectedErrors.length,
    detail: failures.length > 0 || injectedErrors.length > 0 || unexpectedErrors.length > 0 || probeDeficit > 0
      ? JSON.stringify({
        probeFailures: failures.slice(0, 3),
        probeFailuresByEmission: summarizeProbeFailuresByEmission(failures),
        injectedErrors: injectedErrors.slice(0, 3),
        unexpectedErrors: unexpectedErrors.slice(0, 3),
        expectedProbes,
        observedProbes: probes.length,
      })
      : undefined,
    timing: summarizeSamples(durations),
    successTiming: summarizeSamples(successDurations),
    failureTiming: summarizeSamples(failureDurations),
  };
};

const StreamingComponent = ({ label }: { label: string }) =>
  React.createElement("div", null, `chunk-${label}`);

/**
 * Simulates a Next.js-like scenario where a Server Action is triggered 
 * while a Streaming Render for the same request is still in-flight, 
 * ensuring they share state but don't corrupt each other's snapshots.
 */
const runMidStreamActionOverlap = async (
  requestCount: number,
  retainedSnapshots: unknown[],
): Promise<GapResult> => {
  const durations: number[] = [];
  const successDurations: number[] = [];
  const failureDurations: number[] = [];
  const injectedErrorMessages: string[] = [];
  const unexpectedErrorMessages: string[] = [];
  const mismatches: Array<{
    requestId: number;
    renderPhase: string[];
    actionPhase: string[];
    detail?: string;
  }> = [];

  await Promise.all(
    Array.from({ length: requestCount }, async (_value, index) => {
      await wait(randomInt(20)); // skew start
      const requestId = 20_000 + index + 1;
      const request = createStoreForRequest<{ session: SessionState }>((api) => {
        api.create("session", buildSession(requestId, "rendering"));
      });
      const capture = request.capture();
      const actionScope = createRequestScope(capture);
      const startedAt = performance.now();

      let actionSnapshot: SessionState | null = null;
      let errorMessage: string | undefined;
      let actionErrored = false;

      try {
        await request.hydrate(async () => {
          await jitter();
          const streamDone = new Promise<void>((resolve, reject) => {
            let resolveReady: () => void = () => {};
            let rejectReady: (error: unknown) => void = () => {};
            const readyPromise = new Promise<void>((res, rej) => {
              resolveReady = res;
              rejectReady = rej;
            });

            const stream = renderToPipeableStream(
              React.createElement(StreamingComponent, { label: `${requestId}` }),
              {
                onShellReady() {
                  setStore("session", (draft: SessionState) => {
                    draft.logs.push("shell-ready");
                    draft.phase = "rendering-shell";
                    draft.revision += 1;
                  });
                },
                onAllReady() {
                  setStore("session", (draft: SessionState) => {
                    draft.logs.push("all-ready");
                    draft.phase = "rendering-all";
                    draft.revision += 1;
                  });
                  resolveReady();
                },
                onError: (error) => {
                  rejectReady(error);
                },
              },
            ) as ReturnType<typeof renderToPipeableStream> & { abort?: () => void };
            // drain but discard output to keep stream alive until onAllReady
            const sink = new Writable({
              write(_chunk, _encoding, callback) {
                setTimeout(callback, randomInt(10)); // backpressure to simulate slow client
              },
            });
            sink.on("error", reject);
            const sinkFinished = new Promise<void>((sinkResolve, sinkReject) => {
              sink.on("finish", sinkResolve);
              sink.on("error", sinkReject);
            });
            stream.pipe(sink);

            Promise.all([readyPromise, sinkFinished]).then(
              () => resolve(),
              (error) => reject(error),
            );

            if (randomChance(0.15)) {
              // abort mid-stream to simulate client cancellation
              setTimeout(() => {
                try {
                  stream.abort?.();
                } catch {
                  /* ignore */
                }
              }, randomInt(6));
            }
          });

          const action = actionScope.run(async (api) => {
            if (randomChance(0.5)) {
              await wait(5); // sometimes delay action so stream can advance first
            }
            await jitter();
            await wait(0);
            if (randomChance(0.1)) {
              throw new Error("Injected failure inside server action");
            }
            const beforeRevision = (api.get("session") as SessionState).revision;
            if (beforeRevision !== 0) {
              throw new Error(`Isolation revision drift before action: ${beforeRevision}`);
            }
            api.set("session", (draft) => {
              draft.logs.push("action-run");
              draft.phase = "server-action";
              draft.revision += 1;
              draft.logs.push("x".repeat(512));
            });
            await wait(1);
            await jitter();
            const snapshot = api.get("session") as SessionState;
            if (snapshot.revision !== beforeRevision + 1) {
              throw new Error(
                `Isolation revision drift after action: before=${beforeRevision} after=${snapshot.revision}`,
              );
            }
            return snapshot;
          });

          try {
            const [result] = await Promise.all([action, streamDone]);
            actionSnapshot = result;
          } catch (error) {
            actionErrored = true;
            throw error;
          }

          // finalize render snapshot
          setStore("session", (draft: SessionState) => {
            draft.logs.push("render-complete");
            draft.phase = "render-complete";
            draft.revision += 1;
          });
        });
      } catch (error) {
        errorMessage = `req ${requestId} stream/action error: ${(error as Error).message}`;
        if (isInjectedChaosError(errorMessage)) {
          injectedErrorMessages.push(errorMessage);
        } else {
          unexpectedErrorMessages.push(errorMessage);
        }
      }

      const renderSnapshot = request.snapshot().session as SessionState;
      retainedSnapshots.push(renderSnapshot);
      durations.push(round(performance.now() - startedAt));

      const actionContainsRenderMarkers = (actionSnapshot?.logs ?? []).some((entry) =>
        entry === "shell-ready" || entry === "all-ready" || entry === "render-complete");
      if (
        renderSnapshot.requestId !== requestId
        || actionSnapshot?.requestId !== requestId
        || (actionSnapshot !== null && actionSnapshot.revision !== 1)
        || renderSnapshot.logs.includes("action-run")
        || actionContainsRenderMarkers
        || (actionSnapshot?.logs ?? []).includes("render-complete")
      ) {
        if (!errorMessage && !actionErrored) {
          mismatches.push({
            requestId,
            renderPhase: renderSnapshot.logs,
            actionPhase: actionSnapshot?.logs ?? [],
            detail: `actionRevision=${actionSnapshot?.revision ?? "null"} actionErrored=${String(actionErrored)}`,
          });
        }
      }
      assert.strictEqual(hasStore("session"), false, "Streaming request left session store attached");
      const isIsolationFailure =
        renderSnapshot.requestId !== requestId
        || actionSnapshot?.requestId !== requestId
        || (actionSnapshot !== null && actionSnapshot.revision !== 1)
        || renderSnapshot.logs.includes("action-run")
        || actionContainsRenderMarkers
        || (actionSnapshot?.logs ?? []).includes("render-complete");
      if (isIsolationFailure && !errorMessage && !actionErrored) {
        failureDurations.push(durations[durations.length - 1]!);
      } else if (!errorMessage && !actionErrored) {
        successDurations.push(durations[durations.length - 1]!);
      }
    }),
  );

  return {
    name: "Server action overlaps streaming render without cross-bleed",
    size: requestCount,
    checks: requestCount,
    isolationFailures: mismatches.length + unexpectedErrorMessages.length,
    injectedErrors: injectedErrorMessages.length,
    detail: mismatches.length > 0 || unexpectedErrorMessages.length > 0 || injectedErrorMessages.length > 0
      ? JSON.stringify({
        mismatches: mismatches.slice(0, 2),
        unexpectedErrors: unexpectedErrorMessages.slice(0, 3),
        injectedErrors: injectedErrorMessages.slice(0, 3),
      })
      : undefined,
    timing: summarizeSamples(durations),
    successTiming: summarizeSamples(successDurations),
    failureTiming: summarizeSamples(failureDurations),
  };
};

/**
 * Verifies that in worker environments, the request scope is fully 
 * purged even if the user code throws or leaves dangling promises.
 */
const runWorkerPostLifecycle = async (requestCount: number): Promise<GapResult> => {
  const durations: number[] = [];
  const successDurations: number[] = [];
  const failureDurations: number[] = [];
  const leaks: Array<{ requestId: number; carrierRequestId: number | null; store: number | null }> = [];
  const injectedErrors: string[] = [];
  const unexpectedErrors: string[] = [];

  await Promise.all(
    Array.from({ length: requestCount }, async (_value, index) => {
      await wait(randomInt(20)); // skew start
      const requestId = 30_000 + index + 1;
      const scope = createRequestScope<{ session: SessionState }>({
        snapshot: { session: buildSession(requestId, "worker") },
        options: {},
      });
      const startedAt = performance.now();
      let errored = false;

      try {
        await scope.run(async (api) => {
          api.set("session", (draft) => {
            draft.logs.push("worker-run");
            draft.revision += 1;
            draft.logs.push("x".repeat(512));
          });
          await Promise.all([jitter(), jitter(), jitter()]);
          if (randomChance(0.05)) {
            throw new Error("Injected failure inside worker scope");
          }
        });
      } catch (error) {
        const message = `req ${requestId} worker error: ${(error as Error).message}`;
        if (isInjectedChaosError(message)) {
          injectedErrors.push(message);
        } else {
          unexpectedErrors.push(message);
        }
        errored = true;
      }

      // wait for any leaked async tasks (immediate + delayed)
      await wait(5);
      await Promise.resolve();
      const { carrierRequestId, storeRequestId } = recordContext();
      if (carrierRequestId !== null || storeRequestId !== null || hasStore("session")) {
        leaks.push({
          requestId,
          carrierRequestId,
          store: storeRequestId,
        });
        failureDurations.push(round(performance.now() - startedAt));
      } else if (!errored) {
        successDurations.push(round(performance.now() - startedAt));
      }
      durations.push(round(performance.now() - startedAt));
    }),
  );

  return {
    name: "Portable scope clears after lifecycle",
    size: requestCount,
    checks: requestCount,
    isolationFailures: leaks.length + unexpectedErrors.length,
    injectedErrors: injectedErrors.length,
    detail: leaks.length > 0 || injectedErrors.length > 0 || unexpectedErrors.length > 0
      ? JSON.stringify({
        leaks: leaks.slice(0, 3),
        injectedErrors: injectedErrors.slice(0, 3),
        unexpectedErrors: unexpectedErrors.slice(0, 3),
      })
      : undefined,
    timing: summarizeSamples(durations),
    successTiming: summarizeSamples(successDurations),
    failureTiming: summarizeSamples(failureDurations),
  };
};

/**
 * Main benchmark execution entry point.
 */
export const runSsrGapBenchmark = async (): Promise<BenchmarkResult> => {
  const sampleHeap = (): number => {
    maybeGc();
    return heapMb();
  };
  const baselineHeap = round((sampleHeap() + sampleHeap() + sampleHeap()) / 3);
  const preboundAls: GapResult[] = [];
  const preboundPortable: GapResult[] = [];
  const midStreamActionOverlap: GapResult[] = [];
  const workerPostLifecycle: GapResult[] = [];
  const retainedSnapshots: unknown[] = [];

  const heapCheckpoints: Record<string, number> = {};

  for (const size of SIZE_LEVELS) {
    resetAllStoresForTest();
    const preboundSize = Math.max(8, Math.min(size, PREBOUND_REQUESTS * 4));
    const streamSize = Math.max(8, Math.min(size, OVERLAP_REQUESTS));
    const workerSize = Math.max(12, Math.min(size * 2, WORKER_REQUESTS * 2));

    const [alsResult, portableResult, streamResult, workerResult] = await Promise.all([
      runPreboundAlsHazard(preboundSize, retainedSnapshots),
      runPreboundPortableHazard(preboundSize),
      runMidStreamActionOverlap(streamSize, retainedSnapshots),
      runWorkerPostLifecycle(workerSize),
    ]);

    preboundAls.push(alsResult);
    heapCheckpoints[`after-als-${size}`] = round(sampleHeap());
    preboundPortable.push(portableResult);
    heapCheckpoints[`after-portable-${size}`] = round(sampleHeap());
    midStreamActionOverlap.push(streamResult);
    heapCheckpoints[`after-stream-${size}`] = round(sampleHeap());
    workerPostLifecycle.push(workerResult);
    heapCheckpoints[`after-worker-${size}`] = round(sampleHeap());
  }

  const heapBeforeRetainedRelease = round(sampleHeap());
  retainedSnapshots.length = 0;
  maybeGc();
  const heapAfterRetainedRelease = round(sampleHeap());
  const retainedReleaseMb = round(heapBeforeRetainedRelease - heapAfterRetainedRelease);
  heapCheckpoints["before-retained-release"] = heapBeforeRetainedRelease;
  heapCheckpoints["after-retained-release"] = heapAfterRetainedRelease;

  const finalHeap = round((sampleHeap() + sampleHeap() + sampleHeap()) / 3);
  const heapDeltaMb = round(finalHeap - baselineHeap);
  const heapSpikeMb = Math.max(
    heapDeltaMb,
    ...Object.values(heapCheckpoints).map((value) => round(value - baselineHeap)),
  );

  const firstFailure = [...preboundAls, ...preboundPortable, ...midStreamActionOverlap, ...workerPostLifecycle]
    .find((result) => result.isolationFailures > 0);

  assert.ok(
    !firstFailure,
    `Isolation failed (size=${firstFailure?.size}): ${firstFailure?.name} -> ${firstFailure?.detail ?? "no detail"}`,
  );
  assert.ok(
    heapDeltaMb <= MAX_HEAP_DELTA_MB,
    `Heap grew ${heapDeltaMb} MB (limit ${MAX_HEAP_DELTA_MB} MB)`,
  );
  assert.ok(
    heapSpikeMb <= MAX_HEAP_DELTA_MB,
    `Heap spike ${heapSpikeMb} MB (limit ${MAX_HEAP_DELTA_MB} MB)`,
  );

  return {
    name: "SSR Gap Coverage Benchmark",
    sizes: SIZE_LEVELS,
    preboundAls,
    preboundPortable,
    midStreamActionOverlap,
    workerPostLifecycle,
    heapDeltaMb,
    seed: SEED,
    heapCheckpoints,
    heapSpikeMb,
    retainedReleaseMb,
  };
};

const main = async () => {
  try {
    const result = await runSsrGapBenchmark();
    emitReport({
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      result,
    });
  } catch (error) {
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
