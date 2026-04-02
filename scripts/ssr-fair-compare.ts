import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { performance } from "node:perf_hooks";
import React, {
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";
import { renderToPipeableStream } from "react-dom/server";
import {
  createStore as createReduxStore,
  type Store as ReduxStore,
} from "redux";
import {
  createStore as createZustandStore,
  type StoreApi as ZustandStoreApi,
} from "zustand/vanilla";
import { createStoreForRequest } from "../src/server/index.js";
import { useStore } from "../src/react/index.js";
import {
  getStore,
  setStore,
  store,
} from "../src/store.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import {
  emitReport,
  heapMb,
  isMainModule,
  maybeGc,
  median,
  p95,
  round,
  wait,
} from "./benchmark-guarantee-utils.js";

type ModeName = "baseline" | "redux" | "zustand" | "stroid";
type WriteLabel = "db" | "render";

type SessionState = {
  requestId: number;
  token: string;
  checksum: number;
  steps: string[];
};

type SessionAction = {
  type: "write";
  label: WriteLabel;
};

type RenderedMarkers = {
  requestId: number | null;
  checksum: number | null;
  token: string | null;
  steps: string | null;
};

type CorrectnessAccumulator = {
  contaminationCount: number;
  mismatchCount: number;
  statusErrorCount: number;
};

type BurstSummary = {
  concurrency: number;
  requests: number;
  medianMs: number;
  p95Ms: number;
  reqPerSec: number;
  totalWallMs: number;
  contaminationCount: number;
  mismatchCount: number;
  statusErrorCount: number;
};

type ModeSummary = {
  medianMs: number;
  p95Ms: number;
  reqPerSec: number;
  totalRequests: number;
  totalWallMs: number;
  heapDeltaMb: number | null;
  bursts: BurstSummary[];
};

type CorrectnessSummary = CorrectnessAccumulator & {
  violations: number;
};

type FinalReport = {
  environment: {
    node: string;
    platform: string;
    arch: string;
    concurrencies: number[];
    warmupRounds: number;
    warmupConcurrency: number;
    renderEngine: "react-dom/server renderToPipeableStream";
    transport: "native-http";
    note: string;
  };
  baseline: ModeSummary;
  redux: ModeSummary;
  zustand: ModeSummary;
  stroid: ModeSummary;
  correctness: {
    redux: CorrectnessSummary;
    zustand: CorrectnessSummary;
    stroid: CorrectnessSummary;
  };
};

const CONCURRENCIES = (
  process.env.STROID_SSR_COMPARE_CONCURRENCIES?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
) ?? [100, 500, 1000];

const EFFECTIVE_CONCURRENCIES = CONCURRENCIES.length > 0 ? CONCURRENCIES : [100, 500, 1000];
const WARMUP_ROUNDS = Number(process.env.STROID_SSR_COMPARE_WARMUP_ROUNDS ?? 2);
const WARMUP_CONCURRENCY = Number(process.env.STROID_SSR_COMPARE_WARMUP_CONCURRENCY ?? 25);
const RESPONSE_TIMEOUT_MS = Number(process.env.STROID_SSR_COMPARE_RESPONSE_TIMEOUT_MS ?? 10_000);

const modeOffsets: Record<ModeName, number> = {
  baseline: 1_000_000,
  redux: 2_000_000,
  zustand: 3_000_000,
  stroid: 4_000_000,
};

const stroidSessionStore = store<"session", SessionState>("session");

const ReduxStoreContext = createContext<ReduxStore<SessionState, SessionAction> | null>(null);
const ZustandStoreContext = createContext<ZustandStoreApi<SessionState> | null>(null);

const nextImmediate = async (): Promise<void> =>
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

const nextMicrotask = async (): Promise<void> =>
  await new Promise((resolve) => {
    queueMicrotask(resolve);
  });

const createSession = (requestId: number): SessionState => ({
  requestId,
  token: `token-${requestId}`,
  checksum: requestId * 100,
  steps: ["init"],
});

const applySessionWrite = (session: SessionState, label: WriteLabel): SessionState => ({
  ...session,
  checksum: session.checksum + 1,
  steps: [...session.steps, label],
});

const applyDraftSessionWrite = (draft: SessionState, label: WriteLabel): void => {
  draft.checksum += 1;
  draft.steps.push(label);
};

const validateSession = (requestId: number, session: SessionState): void => {
  assert.equal(session.requestId, requestId);
  assert.equal(session.token, `token-${requestId}`);
  assert.equal(session.checksum, (requestId * 100) + 2);
  assert.equal(session.steps.join("|"), "init|db|render");
};

const SessionMarkup = ({
  mode,
  session,
}: {
  mode: ModeName;
  session: SessionState;
}) =>
  React.createElement(
    "article",
    {
      "data-mode": mode,
      "data-request-id": String(session.requestId),
      "data-checksum": String(session.checksum),
      "data-token": session.token,
      "data-steps": session.steps.join("|"),
    },
    React.createElement("h1", null, `${mode}-request-${session.requestId}`),
    React.createElement("p", null, session.token),
    React.createElement("p", null, `checksum-${session.checksum}`),
    React.createElement("p", null, `steps-${session.steps.join("|")}`),
  );

const BaselineApp = ({ session }: { session: SessionState }) =>
  React.createElement(SessionMarkup, { mode: "baseline", session });

const useReduxSession = (): SessionState => {
  const storeInstance = useContext(ReduxStoreContext);
  if (!storeInstance) throw new Error("Redux store context missing.");
  return useSyncExternalStore(
    storeInstance.subscribe,
    storeInstance.getState,
    storeInstance.getState,
  );
};

const ReduxApp = () =>
  React.createElement(SessionMarkup, {
    mode: "redux",
    session: useReduxSession(),
  });

const useZustandSession = (): SessionState => {
  const storeInstance = useContext(ZustandStoreContext);
  if (!storeInstance) throw new Error("Zustand store context missing.");
  return useSyncExternalStore(
    (onChange) => storeInstance.subscribe(() => onChange()),
    storeInstance.getState,
    storeInstance.getState,
  );
};

const ZustandApp = () =>
  React.createElement(SessionMarkup, {
    mode: "zustand",
    session: useZustandSession(),
  });

const StroidApp = () => {
  const session = useStore(stroidSessionStore, (state) => state);
  if (!session) throw new Error("Stroid request store missing during render.");
  return React.createElement(SessionMarkup, {
    mode: "stroid",
    session,
  });
};

const performEquivalentWorkload = async (
  requestId: number,
  adapter: {
    read: () => SessionState;
    write: (label: WriteLabel) => void;
  },
): Promise<SessionState> => {
  await Promise.resolve();
  await nextMicrotask();
  await nextImmediate();
  await wait(requestId % 3);

  adapter.write("db");
  assert.equal(adapter.read().steps.join("|"), "init|db");

  await Promise.resolve().then(async () => {
    await Promise.resolve();
  });
  await nextMicrotask();
  await wait((requestId + 1) % 3);

  adapter.write("render");
  const final = adapter.read();
  validateSession(requestId, final);
  return final;
};

const renderElementToHtml = async (element: React.ReactElement): Promise<string> =>
  await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      pipeable.abort();
      reject(new Error("SSR render timed out."));
    }, RESPONSE_TIMEOUT_MS);
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    let pipeable!: ReturnType<typeof renderToPipeableStream>;

    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    };

    sink.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    sink.on("end", () => finish());
    sink.on("error", finish);

    pipeable = renderToPipeableStream(element, {
      onAllReady() {
        pipeable.pipe(sink);
      },
      onShellError(error) {
        finish(error);
      },
      onError(error) {
        if (!settled) finish(error);
      },
    });
  });

const renderBaselineRequest = async (requestId: number): Promise<string> => {
  let session = createSession(requestId);
  await performEquivalentWorkload(requestId, {
    read: () => session,
    write: (label) => {
      session = applySessionWrite(session, label);
    },
  });
  return await renderElementToHtml(
    React.createElement(BaselineApp, { session }),
  );
};

const createReduxRequestStore = (requestId: number): ReduxStore<SessionState, SessionAction> =>
  createReduxStore(
    (state: SessionState = createSession(requestId), action: SessionAction): SessionState => {
      if (action.type !== "write") return state;
      return applySessionWrite(state, action.label);
    },
  );

const renderReduxRequest = async (requestId: number): Promise<string> => {
  const requestStore = createReduxRequestStore(requestId);
  await performEquivalentWorkload(requestId, {
    read: () => requestStore.getState(),
    write: (label) => {
      requestStore.dispatch({ type: "write", label });
    },
  });
  return await renderElementToHtml(
    React.createElement(
      ReduxStoreContext.Provider,
      { value: requestStore },
      React.createElement(ReduxApp),
    ),
  );
};

const createZustandRequestStore = (requestId: number): ZustandStoreApi<SessionState> =>
  createZustandStore<SessionState>()(() => createSession(requestId));

const renderZustandRequest = async (requestId: number): Promise<string> => {
  const requestStore = createZustandRequestStore(requestId);
  await performEquivalentWorkload(requestId, {
    read: () => requestStore.getState(),
    write: (label) => {
      requestStore.setState((current) => applySessionWrite(current, label));
    },
  });
  return await renderElementToHtml(
    React.createElement(
      ZustandStoreContext.Provider,
      { value: requestStore },
      React.createElement(ZustandApp),
    ),
  );
};

const renderStroidRequest = async (requestId: number): Promise<string> => {
  const requestContext = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", createSession(requestId));
  });

  return await requestContext.hydrate(async () => {
    await performEquivalentWorkload(requestId, {
      read: () => {
        const session = getStore("session") as SessionState | null;
        if (!session) throw new Error("Stroid session store missing.");
        return session;
      },
      write: (label) => {
        setStore("session", (draft: SessionState) => {
          applyDraftSessionWrite(draft, label);
        });
      },
    });

    return await renderElementToHtml(React.createElement(StroidApp));
  });
};

const renderByMode = async (mode: ModeName, requestId: number): Promise<string> => {
  if (mode === "baseline") return await renderBaselineRequest(requestId);
  if (mode === "redux") return await renderReduxRequest(requestId);
  if (mode === "zustand") return await renderZustandRequest(requestId);
  return await renderStroidRequest(requestId);
};

const writeHttpHtml = async (
  response: ServerResponse,
  html: string,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    response.on("finish", () => resolve());
    response.on("error", reject);
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  });
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const mode = url.searchParams.get("mode") as ModeName | null;
    const requestId = Number(url.searchParams.get("requestId") ?? "0");

    if (!mode || !["baseline", "redux", "zustand", "stroid"].includes(mode)) {
      response.statusCode = 400;
      response.end("invalid-mode");
      return;
    }

    if (!Number.isFinite(requestId) || requestId <= 0) {
      response.statusCode = 400;
      response.end("invalid-request-id");
      return;
    }

    const html = await renderByMode(mode, requestId);
    await writeHttpHtml(response, html);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    // Avoid reflecting internal error details in a network response.
    response.end("internal-error");
    // Avoid logging stack traces by default (keeps benchmark output less noisy and reduces info exposure risk).
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ssr-fair-compare] request failed: ${message}`);
  }
};

const parseMarkers = (html: string): RenderedMarkers => ({
  requestId: Number(/data-request-id="(\d+)"/.exec(html)?.[1] ?? NaN) || null,
  checksum: Number(/data-checksum="(\d+)"/.exec(html)?.[1] ?? NaN) || null,
  token: /data-token="([^"]+)"/.exec(html)?.[1] ?? null,
  steps: /data-steps="([^"]+)"/.exec(html)?.[1] ?? null,
});

const createCorrectnessAccumulator = (): CorrectnessAccumulator => ({
  contaminationCount: 0,
  mismatchCount: 0,
  statusErrorCount: 0,
});

const validateResponse = (
  requestId: number,
  status: number,
  html: string,
  correctness: CorrectnessAccumulator,
): void => {
  if (status !== 200) {
    correctness.statusErrorCount += 1;
    return;
  }

  const markers = parseMarkers(html);
  const expectedChecksum = (requestId * 100) + 2;

  if (
    markers.requestId !== requestId
    || markers.token !== `token-${requestId}`
  ) {
    correctness.contaminationCount += 1;
  }

  if (
    markers.checksum !== expectedChecksum
    || markers.steps !== "init|db|render"
  ) {
    correctness.mismatchCount += 1;
  }
};

const summarizeCorrectness = (
  correctness: CorrectnessAccumulator,
): CorrectnessSummary => ({
  ...correctness,
  violations:
    correctness.contaminationCount
    + correctness.mismatchCount
    + correctness.statusErrorCount,
});

const runBurst = async (
  baseUrl: string,
  mode: ModeName,
  concurrency: number,
  requestBase: number,
  correctness: CorrectnessAccumulator,
): Promise<{ summary: BurstSummary; latencies: number[] }> => {
  const requestIds = Array.from(
    { length: concurrency },
    (_value, index) => requestBase + index + 1,
  );
  const startedAt = performance.now();
  const responses = await Promise.all(
    requestIds.map(async (requestId) => {
      const requestStartedAt = performance.now();
      const response = await fetch(
        `${baseUrl}/render?mode=${mode}&requestId=${requestId}`,
      );
      const html = await response.text();
      const durationMs = round(performance.now() - requestStartedAt);
      validateResponse(requestId, response.status, html, correctness);
      return {
        durationMs,
        status: response.status,
      };
    }),
  );

  const totalWallMs = round(performance.now() - startedAt);
  const latencies = responses.map((entry) => entry.durationMs);
  const statusErrorCount = responses.filter((entry) => entry.status !== 200).length;

  return {
    latencies,
    summary: {
      concurrency,
      requests: concurrency,
      medianMs: round(median(latencies)),
      p95Ms: round(p95(latencies)),
      reqPerSec: round(concurrency / (totalWallMs / 1000)),
      totalWallMs,
      contaminationCount: correctness.contaminationCount,
      mismatchCount: correctness.mismatchCount,
      statusErrorCount,
    },
  };
};

const runWarmup = async (
  baseUrl: string,
  mode: ModeName,
): Promise<void> => {
  const correctness = createCorrectnessAccumulator();

  for (let roundIndex = 0; roundIndex < WARMUP_ROUNDS; roundIndex += 1) {
    await runBurst(
      baseUrl,
      mode,
      WARMUP_CONCURRENCY,
      modeOffsets[mode] + (roundIndex * 10_000),
      correctness,
    );
  }

  const summary = summarizeCorrectness(correctness);
  if (summary.violations > 0) {
    throw new Error(
      `Warmup correctness failed for ${mode}: ${JSON.stringify(summary)}`,
    );
  }
};

const runModeBenchmark = async (
  baseUrl: string,
  mode: ModeName,
): Promise<{ summary: ModeSummary; correctness: CorrectnessSummary }> => {
  const correctness = createCorrectnessAccumulator();
  const burstResults: BurstSummary[] = [];
  const allLatencies: number[] = [];

  if (mode === "stroid") {
    resetAllStoresForTest();
  }

  await runWarmup(baseUrl, mode);
  maybeGc();
  const beforeHeap = typeof global.gc === "function" ? heapMb() : null;

  let requestBase = modeOffsets[mode] + 100_000;
  for (const concurrency of EFFECTIVE_CONCURRENCIES) {
    const burstCorrectness = createCorrectnessAccumulator();
    const { summary, latencies } = await runBurst(
      baseUrl,
      mode,
      concurrency,
      requestBase,
      burstCorrectness,
    );
    requestBase += concurrency + 10_000;
    correctness.contaminationCount += burstCorrectness.contaminationCount;
    correctness.mismatchCount += burstCorrectness.mismatchCount;
    correctness.statusErrorCount += burstCorrectness.statusErrorCount;
    burstResults.push({
      ...summary,
      contaminationCount: burstCorrectness.contaminationCount,
      mismatchCount: burstCorrectness.mismatchCount,
    });
    allLatencies.push(...latencies);
  }

  maybeGc();
  const afterHeap = typeof global.gc === "function" ? heapMb() : null;

  if (mode === "stroid") {
    resetAllStoresForTest();
  }

  const totalWallMs = round(
    burstResults.reduce((sum, burst) => sum + burst.totalWallMs, 0),
  );
  const totalRequests = burstResults.reduce(
    (sum, burst) => sum + burst.requests,
    0,
  );
  const summary: ModeSummary = {
    medianMs: round(median(allLatencies)),
    p95Ms: round(p95(allLatencies)),
    reqPerSec: round(totalRequests / (totalWallMs / 1000)),
    totalRequests,
    totalWallMs,
    heapDeltaMb: beforeHeap === null || afterHeap === null
      ? null
      : round(afterHeap - beforeHeap),
    bursts: burstResults,
  };

  return {
    summary,
    correctness: summarizeCorrectness(correctness),
  };
};

const startServer = async () => {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

export const runFairSsrCompareBenchmark = async (): Promise<FinalReport> => {
  const { server, baseUrl } = await startServer();

  try {
    const baseline = await runModeBenchmark(baseUrl, "baseline");
    const redux = await runModeBenchmark(baseUrl, "redux");
    const zustand = await runModeBenchmark(baseUrl, "zustand");
    const stroid = await runModeBenchmark(baseUrl, "stroid");

    if (baseline.correctness.violations > 0) {
      throw new Error(
        `Baseline correctness failed: ${JSON.stringify(baseline.correctness)}`,
      );
    }

    return {
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        concurrencies: EFFECTIVE_CONCURRENCIES,
        warmupRounds: WARMUP_ROUNDS,
        warmupConcurrency: WARMUP_CONCURRENCY,
        renderEngine: "react-dom/server renderToPipeableStream",
        transport: "native-http",
        note: "All modes run in the same process, use the same async workload, and are measured end-to-end from fetch start until the streamed HTML response is fully read.",
      },
      baseline: baseline.summary,
      redux: redux.summary,
      zustand: zustand.summary,
      stroid: stroid.summary,
      correctness: {
        redux: redux.correctness,
        zustand: zustand.correctness,
        stroid: stroid.correctness,
      },
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

const main = async () => {
  const result = await runFairSsrCompareBenchmark();
  emitReport(result);
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
