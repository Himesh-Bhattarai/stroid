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

const PAIRS = Number(process.env.STROID_NEXT_SERVER_ACTION_PAIRS ?? 48);

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
