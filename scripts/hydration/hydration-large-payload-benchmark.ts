import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  emitReport,
  heapMb,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
} from "../guarantees/benchmark-guarantee-utils.js";
import {
  createLargePayloadState,
  estimateBytes,
  runLargePayloadScenario,
} from "./hydration-large-payload-shared.js";
import { deepClone } from "../../src/utils.js";

type PayloadSizeResult = {
  targetKb: number;
  approximateBytes: number;
  cloneTiming: ReturnType<typeof summarizeSamples>;
  immediateTiming: ReturnType<typeof summarizeSamples>;
  queuedTiming: ReturnType<typeof summarizeSamples>;
  retainedGrowthMb: number;
  mismatches: number;
  queuedWritesSeen: number[];
  replayedWritesSeen: number[];
  sampleRevision: number | null;
  sampleTouchedCount: number | null;
};

type BenchmarkResult = {
  name: string;
  sizes: PayloadSizeResult[];
  totalWallMs: number;
};

const TARGET_SIZES_KB = (
  process.env.STROID_HYDRATION_LARGE_SIZES
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
) ?? [256, 1024, 2048];
const SAMPLES_PER_SIZE = Number(process.env.STROID_HYDRATION_LARGE_SAMPLES ?? 2);

const distinctNumbers = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

export const runHydrationLargePayloadBenchmark = async (): Promise<BenchmarkResult> => {
  const startedAt = performance.now();
  const sizes: PayloadSizeResult[] = [];

  for (const targetKb of TARGET_SIZES_KB) {
    const cloneDurations: number[] = [];
    const immediateDurations: number[] = [];
    const queuedDurations: number[] = [];
    const queuedWritesSeen: number[] = [];
    const replayedWritesSeen: number[] = [];
    let approximateBytes = 0;
    let sampleRevision: number | null = null;
    let sampleTouchedCount: number | null = null;
    let mismatches = 0;

    maybeGc();
    const heapBeforeMb = heapMb();

    for (let sample = 0; sample < SAMPLES_PER_SIZE; sample += 1) {
      const baseline = createLargePayloadState(targetKb);
      approximateBytes = estimateBytes(baseline);

      const cloneStartedAt = performance.now();
      void deepClone(baseline);
      cloneDurations.push(round(performance.now() - cloneStartedAt));

      const immediateStartedAt = performance.now();
      const immediate = await runLargePayloadScenario({
        targetKb,
        queued: false,
      });
      immediateDurations.push(round(performance.now() - immediateStartedAt));

      const queuedStartedAt = performance.now();
      const queued = await runLargePayloadScenario({
        targetKb,
        queued: true,
      });
      queuedDurations.push(round(performance.now() - queuedStartedAt));

      queuedWritesSeen.push(queued.queuedWrites);
      replayedWritesSeen.push(queued.replayedWrites);

      const matchedState = JSON.stringify(immediate.finalState) === JSON.stringify(queued.finalState);
      const matchedDrift = immediate.driftEvents === queued.driftEvents;
      const matchedQueue = queued.queuedWrites === 3 && queued.replayedWrites === 3;
      if (!matchedState || !matchedDrift || !matchedQueue) {
        mismatches += 1;
      }

      if (sampleRevision === null) {
        sampleRevision = queued.finalState?.meta.revision ?? null;
        sampleTouchedCount = queued.finalState?.summary.touched.length ?? null;
      }
    }

    maybeGc();
    const retainedGrowthMb = round(heapMb() - heapBeforeMb);
    assert.strictEqual(mismatches, 0, `large-payload hydration mismatch for ${targetKb} KB`);

    sizes.push({
      targetKb,
      approximateBytes,
      cloneTiming: summarizeSamples(cloneDurations),
      immediateTiming: summarizeSamples(immediateDurations),
      queuedTiming: summarizeSamples(queuedDurations),
      retainedGrowthMb,
      mismatches,
      queuedWritesSeen: distinctNumbers(queuedWritesSeen),
      replayedWritesSeen: distinctNumbers(replayedWritesSeen),
      sampleRevision,
      sampleTouchedCount,
    });
  }

  return {
    name: "Hydration Large Payload Benchmark",
    sizes,
    totalWallMs: round(performance.now() - startedAt),
  };
};

const main = async () => {
  const result = await runHydrationLargePayloadBenchmark();
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
