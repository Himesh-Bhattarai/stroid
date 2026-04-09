import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  emitReport,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
} from "../guarantees/benchmark-guarantee-utils.js";
import {
  runRandomizedHydrationScenario,
  type RandomizedPolicy,
} from "./hydration-randomized-shared.js";

type PolicyResult = {
  policy: RandomizedPolicy;
  seeds: number[];
  runs: number;
  operationsPerRun: number;
  timing: ReturnType<typeof summarizeSamples>;
  driftEventsSeen: number[];
  queuedWritesSeen: number[];
  replayedWritesSeen: number[];
  mismatches: number;
  sampleEventSummary: string[];
  sampleFinalState: unknown;
};

type BenchmarkResult = {
  name: string;
  policies: PolicyResult[];
  totalRuns: number;
  totalWallMs: number;
};

const STEPS = Number(process.env.STROID_HYDRATION_RANDOMIZED_STEPS ?? 36);
const SEEDS = (
  process.env.STROID_HYDRATION_RANDOMIZED_SEEDS
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
) ?? [17, 23, 41, 59, 97, 131];

const distinctNumbers = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

export const runHydrationRandomizedBenchmark = async (): Promise<BenchmarkResult> => {
  const startedAt = performance.now();
  const policies: RandomizedPolicy[] = ["client_wins", "server_wins", "merge"];
  const results: PolicyResult[] = [];

  for (const policy of policies) {
    const durations: number[] = [];
    const driftEventsSeen: number[] = [];
    const queuedWritesSeen: number[] = [];
    const replayedWritesSeen: number[] = [];
    let sampleEventSummary: string[] = [];
    let sampleFinalState: unknown = null;
    let mismatches = 0;

    for (const seed of SEEDS) {
      const immediateStartedAt = performance.now();
      const immediate = await runRandomizedHydrationScenario({
        seed,
        policy,
        queued: false,
        steps: STEPS,
      });
      const queued = await runRandomizedHydrationScenario({
        seed,
        policy,
        queued: true,
        steps: STEPS,
      });
      durations.push(round(performance.now() - immediateStartedAt));

      const matchedState = JSON.stringify(queued.finalState) === JSON.stringify(immediate.finalState);
      const matchedEvents = JSON.stringify(queued.eventSummary) === JSON.stringify(immediate.eventSummary);
      const matchedDrift = queued.driftEvents === immediate.driftEvents;
      const matchedQueue = queued.queuedWrites === STEPS && queued.replayedWrites === STEPS;

      if (!matchedState || !matchedEvents || !matchedDrift || !matchedQueue) {
        mismatches += 1;
      }

      driftEventsSeen.push(queued.driftEvents);
      queuedWritesSeen.push(queued.queuedWrites);
      replayedWritesSeen.push(queued.replayedWrites);

      if (sampleEventSummary.length === 0) {
        sampleEventSummary = queued.eventSummary.slice(0, 12);
        sampleFinalState = queued.finalState;
      }
    }

    assert.strictEqual(mismatches, 0, `randomized hydration certification diverged for policy=${policy}`);

    results.push({
      policy,
      seeds: [...SEEDS],
      runs: SEEDS.length,
      operationsPerRun: STEPS,
      timing: summarizeSamples(durations),
      driftEventsSeen: distinctNumbers(driftEventsSeen),
      queuedWritesSeen: distinctNumbers(queuedWritesSeen),
      replayedWritesSeen: distinctNumbers(replayedWritesSeen),
      mismatches,
      sampleEventSummary,
      sampleFinalState,
    });
    maybeGc();
  }

  return {
    name: "Hydration Randomized Certification",
    policies: results,
    totalRuns: results.reduce((sum, result) => sum + result.runs, 0) * 2,
    totalWallMs: round(performance.now() - startedAt),
  };
};

const main = async () => {
  const result = await runHydrationRandomizedBenchmark();
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
