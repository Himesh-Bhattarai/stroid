import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { getRequestCarrier } from "../../src/core/store-registry.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import { getStoreHealth, listStores } from "../../src/runtime-tools/index.js";
import { createStoreForRequest } from "../../src/server/index.js";
import { getStore, hasStore, setStore } from "../../src/store.js";
import {
  emitReport,
  heapMb,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
  wait,
} from "../guarantees/benchmark-guarantee-utils.js";

type SessionState = {
  requestId: number;
  phase: string;
  count: number;
  trail: string[];
};

type DetachedProbeResult = {
  carrier: Record<string, unknown> | null;
  snapshot: unknown;
};

type MemoryCheckpoint = {
  wave: number;
  requests: number;
  heapMb: number;
  deltaMb: number;
};

type BenchmarkResult = {
  name: string;
  waves: number;
  requestsPerWave: number;
  totalRequests: number;
  detachedProbes: number;
  requestTiming: ReturnType<typeof summarizeSamples>;
  waveTiming: ReturnType<typeof summarizeSamples>;
  retainedGrowthMb: number;
  peakDeltaMb: number;
  checkpoints: MemoryCheckpoint[];
  invariants: {
    detachedLeakCount: number;
    globalResidualCount: number;
    globalStoreCountAfterRun: number;
  };
};

const WARMUP_WAVES = Number(process.env.STROID_SSR_WARM_WARMUP_WAVES ?? 2);
const WAVES = Number(process.env.STROID_SSR_WARM_WAVES ?? 8);
const REQUESTS_PER_WAVE = Number(process.env.STROID_SSR_WARM_REQUESTS_PER_WAVE ?? 128);
const MAX_RETAINED_GROWTH_MB = Number(process.env.STROID_SSR_WARM_MAX_RETAINED_GROWTH_MB ?? 8);

const nextImmediate = async (): Promise<void> =>
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const buildSession = (requestId: number, phase: string): SessionState => ({
  requestId,
  phase,
  count: 0,
  trail: ["init"],
});

const runWarmRequest = async (
  requestId: number,
  phase: string,
): Promise<{ durationMs: number; detached: DetachedProbeResult[] }> => {
  const context = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", buildSession(requestId, phase));
  });

  const detachedReads: Array<Promise<DetachedProbeResult>> = [];
  const startedAt = performance.now();

  await context.hydrate(async () => {
    setStore("session", (draft: SessionState) => {
      draft.count += 1;
      draft.trail.push("set");
    });

    await Promise.resolve();

    setStore("session", (draft: SessionState) => {
      draft.count += 1;
      draft.trail.push("microtask");
    });

    if (requestId % 3 === 0) {
      await wait(0);
      setStore("session", (draft: SessionState) => {
        draft.count += 1;
        draft.trail.push("timer");
      });
    }

    if (requestId % 5 === 0) {
      await nextImmediate();
      setStore("session", (draft: SessionState) => {
        draft.count += 1;
        draft.trail.push("immediate");
      });
    }

    detachedReads.push(
      (async () => {
        await wait(0);
        const carrier = getRequestCarrier();
        return {
          carrier,
          snapshot: carrier === null ? null : getStore("session"),
        };
      })(),
      (async () => {
        await nextImmediate();
        const carrier = getRequestCarrier();
        return {
          carrier,
          snapshot: carrier === null ? null : getStore("session"),
        };
      })(),
    );
  });

  const snapshot = context.snapshot().session;
  assert.ok(snapshot);
  assert.strictEqual(snapshot?.requestId, requestId);
  assert.strictEqual(snapshot?.phase, phase);
  assert.ok((snapshot?.count ?? 0) >= 2);
  assert.ok(snapshot?.trail.includes("set"));
  assert.ok(snapshot?.trail.includes("microtask"));
  assert.strictEqual(hasStore("session"), false);

  return {
    durationMs: round(performance.now() - startedAt),
    detached: await Promise.all(detachedReads),
  };
};

export const runSsrWarmContainerBenchmark = async (): Promise<BenchmarkResult> => {
  resetAllStoresForTest();

  for (let wave = 0; wave < WARMUP_WAVES; wave += 1) {
    for (let request = 0; request < REQUESTS_PER_WAVE; request += 1) {
      await runWarmRequest(wave * REQUESTS_PER_WAVE + request + 1, `warmup-${wave + 1}`);
    }
  }

  maybeGc();
  const baselineHeapMb = heapMb();
  let detachedLeakCount = 0;
  let globalResidualCount = 0;
  const requestDurations: number[] = [];
  const waveDurations: number[] = [];
  const checkpoints: MemoryCheckpoint[] = [];

  for (let wave = 0; wave < WAVES; wave += 1) {
    const waveStartedAt = performance.now();
    for (let request = 0; request < REQUESTS_PER_WAVE; request += 1) {
      const requestId = (wave * REQUESTS_PER_WAVE) + request + 1;
      const result = await runWarmRequest(requestId, `wave-${wave + 1}`);
      requestDurations.push(result.durationMs);

      result.detached.forEach((probe) => {
        const carrierHasSession = Object.prototype.hasOwnProperty.call(probe.carrier ?? {}, "session");
        const snapshotVisible = probe.snapshot !== null && probe.snapshot !== undefined;
        if (carrierHasSession || snapshotVisible) {
          detachedLeakCount += 1;
        }
      });

      const globalStores = listStores();
      const health = getStoreHealth() as { registry?: { totalStores?: number } } | null;
      if (globalStores.length > 0 || (health?.registry?.totalStores ?? 0) > 0) {
        globalResidualCount += 1;
      }
    }

    waveDurations.push(round(performance.now() - waveStartedAt));
    await wait(2);
    maybeGc();
    const currentHeapMb = heapMb();
    checkpoints.push({
      wave: wave + 1,
      requests: (wave + 1) * REQUESTS_PER_WAVE,
      heapMb: round(currentHeapMb),
      deltaMb: round(currentHeapMb - baselineHeapMb),
    });
  }

  maybeGc();
  const finalHeapMb = heapMb();
  const retainedGrowthMb = round(finalHeapMb - baselineHeapMb);
  const peakDeltaMb = checkpoints.length > 0
    ? Math.max(...checkpoints.map((checkpoint) => checkpoint.deltaMb))
    : retainedGrowthMb;
  const globalStoreCountAfterRun = listStores().length;

  assert.strictEqual(detachedLeakCount, 0, `detached warm-container probes leaked ${detachedLeakCount} time(s)`);
  assert.strictEqual(globalResidualCount, 0, `global registry retained request state ${globalResidualCount} time(s)`);
  assert.strictEqual(globalStoreCountAfterRun, 0, `expected zero global stores, saw ${globalStoreCountAfterRun}`);
  assert.ok(
    retainedGrowthMb <= MAX_RETAINED_GROWTH_MB,
    `retained heap grew by ${retainedGrowthMb} MB`,
  );

  return {
    name: "SSR Warm Container Certification",
    waves: WAVES,
    requestsPerWave: REQUESTS_PER_WAVE,
    totalRequests: WAVES * REQUESTS_PER_WAVE,
    detachedProbes: WAVES * REQUESTS_PER_WAVE * 2,
    requestTiming: summarizeSamples(requestDurations),
    waveTiming: summarizeSamples(waveDurations),
    retainedGrowthMb,
    peakDeltaMb,
    checkpoints,
    invariants: {
      detachedLeakCount,
      globalResidualCount,
      globalStoreCountAfterRun,
    },
  };
};

const main = async () => {
  const result = await runSsrWarmContainerBenchmark();
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
