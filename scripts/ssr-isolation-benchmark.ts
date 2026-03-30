import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createStoreForRequest } from "../src/server/index.js";
import { getStore, setStore } from "../src/store.js";
import { listStores } from "../src/runtime-tools/index.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  round,
  summarizeSamples,
  wait,
} from "./benchmark-guarantee-utils.js";

type SessionState = {
  requestId: number;
  token: string;
  steps: string[];
  checksum: number;
  aborted: boolean;
};

type RequestResult = {
  requestId: number;
  durationMs: number;
  aborted: boolean;
};

const REQUESTS = 64;
const ABORT_EVERY = 11;

export const runSsrIsolationBenchmark = async () => {
  resetAllStoresForTest();

  let foreignReadCount = 0;
  const startedAt = performance.now();

  const runRequest = async (requestId: number): Promise<RequestResult> => {
    const context = createStoreForRequest<{ session: SessionState }>((api) => {
      api.create("session", {
        requestId,
        token: `token-${requestId}`,
        steps: ["init"],
        checksum: requestId * 100,
        aborted: false,
      });
    });

    const shouldAbort = requestId % ABORT_EVERY === 0;
    const requestStart = performance.now();
    let aborted = false;

    try {
      await context.hydrate(async () => {
        const initial = getStore("session") as SessionState;
        if (initial.requestId !== requestId) foreignReadCount += 1;
        assert.equal(initial.requestId, requestId);

        await Promise.resolve();
        setStore("session", (draft: SessionState) => {
          draft.steps.push("db");
          draft.checksum += 1;
        });

        await wait(requestId % 3);
        const midFlight = getStore("session") as SessionState;
        if (midFlight.requestId !== requestId) foreignReadCount += 1;
        assert.equal(midFlight.requestId, requestId);
        assert.deepEqual(midFlight.steps, ["init", "db"]);

        setStore("session", (draft: SessionState) => {
          draft.steps.push("render");
          draft.checksum += 1;
          draft.aborted = shouldAbort;
        });

        const final = getStore("session") as SessionState;
        if (final.requestId !== requestId) foreignReadCount += 1;
        assert.equal(final.requestId, requestId);
        assert.deepEqual(final.steps, ["init", "db", "render"]);

        if (shouldAbort) {
          await Promise.resolve();
          throw new Error(`abort-${requestId}`);
        }
      });
    } catch (error) {
      aborted = true;
      assert.match((error as Error).message, new RegExp(`abort-${requestId}`));
    }

    const snapshot = context.snapshot().session as SessionState;
    assert.equal(snapshot.requestId, requestId);
    assert.equal(snapshot.token, `token-${requestId}`);
    assert.deepEqual(snapshot.steps, ["init", "db", "render"]);
    assert.equal(snapshot.aborted, shouldAbort);
    assert.equal(snapshot.checksum, (requestId * 100) + 2);

    await context.hydrate(() => {
      const replay = getStore("session") as SessionState;
      assert.equal(replay.requestId, requestId);
      assert.deepEqual(replay.steps, ["init", "db", "render"]);
      assert.equal(replay.checksum, (requestId * 100) + 2);
    });

    return {
      requestId,
      durationMs: round(performance.now() - requestStart),
      aborted,
    };
  };

  const rows = await Promise.all(
    Array.from({ length: REQUESTS }, (_value, index) => runRequest(index + 1)),
  );

  await flushRuntime();

  const globalStores = listStores();
  assert.equal(foreignReadCount, 0, `SSR isolation leaked ${foreignReadCount} foreign reads`);
  assert.deepEqual(globalStores, [], "Request-local hydration leaked stores into the global registry");

  const durations = rows.map((row) => row.durationMs);
  const abortedRequests = rows.filter((row) => row.aborted).length;

  return {
    name: "SSR Isolation Stress Test",
    requests: REQUESTS,
    abortedRequests,
    timing: summarizeSamples(durations),
    totalWallMs: round(performance.now() - startedAt),
    guarantees: {
      foreignReadCount,
      globalStoreCountAfterRun: globalStores.length,
    },
  };
};

const main = async () => {
  const result = await runSsrIsolationBenchmark();
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
