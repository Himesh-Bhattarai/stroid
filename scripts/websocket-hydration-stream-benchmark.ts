import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  emitReport,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
} from "./benchmark-guarantee-utils.js";
import {
  runWebsocketHydrationStreamScenario,
} from "./websocket-hydration-stream-shared.js";

type BenchmarkResult = {
  name: string;
  runs: number;
  beforeClose: number;
  afterClose: number;
  timing: ReturnType<typeof summarizeSamples>;
  invariants: {
    mismatchCount: number;
    queuedWrites: number;
    replayedWrites: number;
  };
};

const RUNS = Number(process.env.STROID_WEBSOCKET_STREAM_RUNS ?? 24);
const BEFORE_CLOSE = Number(process.env.STROID_WEBSOCKET_STREAM_BEFORE_CLOSE ?? 6);
const AFTER_CLOSE = Number(process.env.STROID_WEBSOCKET_STREAM_AFTER_CLOSE ?? 4);

export const runWebsocketHydrationStreamBenchmark = async (): Promise<BenchmarkResult> => {
  const durations: number[] = [];
  let mismatchCount = 0;

  for (let runIndex = 0; runIndex < RUNS; runIndex += 1) {
    maybeGc();
    const startedAt = performance.now();
    const result = await runWebsocketHydrationStreamScenario({
      beforeClose: BEFORE_CLOSE,
      afterClose: AFTER_CLOSE,
    });
    durations.push(round(performance.now() - startedAt));

    const expectedFinalLastSeq = BEFORE_CLOSE + AFTER_CLOSE;
    if (
      result.finalState?.lastSeq !== expectedFinalLastSeq
      || result.receivedOrder.length !== expectedFinalLastSeq
      || result.queuedWrites !== BEFORE_CLOSE
      || result.replayedWrites !== BEFORE_CLOSE
    ) {
      mismatchCount += 1;
    }
  }

  assert.strictEqual(mismatchCount, 0, `websocket hydration stream mismatched ${mismatchCount} time(s)`);

  return {
    name: "WebSocket Hydration Stream Certification",
    runs: RUNS,
    beforeClose: BEFORE_CLOSE,
    afterClose: AFTER_CLOSE,
    timing: summarizeSamples(durations),
    invariants: {
      mismatchCount,
      queuedWrites: BEFORE_CLOSE,
      replayedWrites: BEFORE_CLOSE,
    },
  };
};

const main = async () => {
  const result = await runWebsocketHydrationStreamBenchmark();
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
