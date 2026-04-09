/**
 * Next.js Server Actions Boundary Certification Benchmark
 * 
 * This benchmark validates the integrity of Stroid's state capture and resumption 
 * mechanism specifically for Next.js App Router patterns. It simulates:
 * 1. Concurrent SSR renders where state is initialized and captured.
 * 2. Resumption of that state within a Server Action context.
 * 3. Strict isolation between concurrent request pairs to ensure no cross-bleed 
 *    occurs during the portable scope hand-off.
 */


import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  renderDraftPage,
  saveDraftAction,
} from "../../examples/next-app-router-server-actions.js";
import {
  emitReport,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
} from "../guarantees/benchmark-guarantee-utils.js";

/**
 * Aggregated metrics and invariant results for the Server Actions benchmark.
 */
type BenchmarkResult = {
  name: string;
  pairs: number;
  renderPairTiming: ReturnType<typeof summarizeSamples>;
  actionPairTiming: ReturnType<typeof summarizeSamples>;
  pairTiming: ReturnType<typeof summarizeSamples>;
  invariants: {
    stateMismatchCount: number;
    crossCaptureBleedCount: number;
  };
};

/**
 * Number of concurrent request pairs to execute. 
 * Configurable via STROID_NEXT_SERVER_ACTION_PAIRS environment variable.
 */
const PAIRS = Number(process.env.STROID_NEXT_SERVER_ACTION_PAIRS ?? 48);

/**
 * Executes the Next.js Server Actions benchmark suite.
 * @returns {Promise<BenchmarkResult>} The aggregated benchmark metrics and invariant audit.
 */
export const runNextServerActionsBenchmark = async (): Promise<BenchmarkResult> => {
  const renderPairDurations: number[] = [];
  const actionPairDurations: number[] = [];
  const pairDurations: number[] = [];
  let stateMismatchCount = 0;
  let crossCaptureBleedCount = 0;

  for (let pair = 1; pair <= PAIRS; pair += 1) {
    maybeGc();
    const pairStartedAt = performance.now();

    const renderStartedAt = performance.now();
    const [renderedA, renderedB] = await Promise.all([
      renderDraftPage({
        userId: `user-A-${pair}`,
        requestId: `req-A-${pair}`,
      }),
      renderDraftPage({
        userId: `user-B-${pair}`,
        requestId: `req-B-${pair}`,
      }),
    ]);
    renderPairDurations.push(round(performance.now() - renderStartedAt));

    const actionStartedAt = performance.now();
    const [resumedA, resumedB] = await Promise.all([
      saveDraftAction(renderedA.requestState, `saved-A-${pair}`),
      saveDraftAction(renderedB.requestState, `saved-B-${pair}`),
    ]);
    actionPairDurations.push(round(performance.now() - actionStartedAt));
    pairDurations.push(round(performance.now() - pairStartedAt));

    const stateA = resumedA.snapshot;
    const stateB = resumedB.snapshot;
    if (
      stateA.session?.userId !== `user-A-${pair}`
      || stateA.session?.requestId !== `req-A-${pair}`
      || stateA.draft?.body !== `saved-A-${pair}`
      || stateA.draft?.lastSavedBy !== `user-A-${pair}`
      || stateA.draft?.revision !== 2
    ) {
      stateMismatchCount += 1;
    }
    if (
      stateB.session?.userId !== `user-B-${pair}`
      || stateB.session?.requestId !== `req-B-${pair}`
      || stateB.draft?.body !== `saved-B-${pair}`
      || stateB.draft?.lastSavedBy !== `user-B-${pair}`
      || stateB.draft?.revision !== 2
    ) {
      stateMismatchCount += 1;
    }

    if (
      stateA.session?.userId === stateB.session?.userId
      || stateA.session?.requestId === stateB.session?.requestId
      || stateA.draft?.lastSavedBy === stateB.draft?.lastSavedBy
    ) {
      crossCaptureBleedCount += 1;
    }
  }

  assert.strictEqual(stateMismatchCount, 0, `next server action state mismatched ${stateMismatchCount} time(s)`);
  assert.strictEqual(crossCaptureBleedCount, 0, `next server action captures bled ${crossCaptureBleedCount} time(s)`);

  return {
    name: "Next.js Server Actions Boundary Certification",
    pairs: PAIRS,
    renderPairTiming: summarizeSamples(renderPairDurations),
    actionPairTiming: summarizeSamples(actionPairDurations),
    pairTiming: summarizeSamples(pairDurations),
    invariants: {
      stateMismatchCount,
      crossCaptureBleedCount,
    },
  };
};

/**
 * Main execution entry point for the benchmark script.
 */
const main = async () => {
  const result = await runNextServerActionsBenchmark();
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
