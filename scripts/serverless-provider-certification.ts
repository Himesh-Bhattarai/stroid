import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { getRequestCarrier } from "../src/core/store-registry.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import { getStoreHealth, listStores } from "../src/runtime-tools/index.js";
import { createStoreForRequest } from "../src/server/index.js";
import { createRequestScope } from "../src/server/portable.js";
import { getStore, hasStore, setStore } from "../src/store.js";
import {
  emitReport,
  heapMb,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
  wait,
} from "./benchmark-guarantee-utils.js";

type SessionState = {
  provider: string;
  requestId: number;
  count: number;
  trail: string[];
};

type DetachedProbeResult = {
  carrier: Record<string, unknown> | null;
  snapshot: unknown;
};

type ProviderResult = {
  provider: "aws_lambda" | "vercel" | "cloudflare_workers";
  runtimeModel: string;
  invocations: number;
  detachedProbes: number;
  timing: ReturnType<typeof summarizeSamples>;
  retainedGrowthMb: number;
  invariants: {
    detachedLeakCount: number;
    globalResidualCount: number;
    globalStoreCountAfterRun: number;
  };
};

type BenchmarkResult = {
  name: string;
  providers: ProviderResult[];
  totalInvocations: number;
};

const INVOCATIONS = Number(process.env.STROID_SERVERLESS_PROVIDER_INVOCATIONS ?? 96);
const MAX_RETAINED_GROWTH_MB = Number(process.env.STROID_SERVERLESS_PROVIDER_MAX_RETAINED_GROWTH_MB ?? 8);

const nextImmediate = async (): Promise<void> =>
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const buildSession = (requestId: number, provider: string): SessionState => ({
  provider,
  requestId,
  count: 0,
  trail: ["seed"],
});

const hasGlobalResidualState = (): boolean => {
  const globalStores = listStores();
  const health = getStoreHealth() as { registry?: { totalStores?: number } } | null;
  return globalStores.length > 0 || (health?.registry?.totalStores ?? 0) > 0;
};

const runLambdaInvocation = async (requestId: number): Promise<{ durationMs: number; detached: DetachedProbeResult[] }> => {
  const request = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", buildSession(requestId, "aws_lambda"));
  });
  const detached: Array<Promise<DetachedProbeResult>> = [];
  const startedAt = performance.now();

  await request.hydrate(async () => {
    setStore("session", (draft: SessionState) => {
      draft.count += 1;
      draft.trail.push("sync");
    });

    await Promise.resolve();
    setStore("session", (draft: SessionState) => {
      draft.count += 1;
      draft.trail.push("microtask");
    });

    detached.push(
      (async () => {
        await wait(0);
        return {
          carrier: getRequestCarrier(),
          snapshot: getStore("session"),
        };
      })(),
      (async () => {
        await nextImmediate();
        return {
          carrier: getRequestCarrier(),
          snapshot: getStore("session"),
        };
      })(),
    );
  });

  assert.deepStrictEqual(request.snapshot(), {
    session: {
      provider: "aws_lambda",
      requestId,
      count: 2,
      trail: ["seed", "sync", "microtask"],
    },
  });
  assert.strictEqual(hasStore("session"), false);

  return {
    durationMs: round(performance.now() - startedAt),
    detached: await Promise.all(detached),
  };
};

const runVercelInvocation = async (requestId: number): Promise<{ durationMs: number; detached: DetachedProbeResult[] }> => {
  const request = createStoreForRequest<{ session: SessionState }>((api) => {
    api.create("session", buildSession(requestId, "vercel"));
  });
  const detached: Array<Promise<DetachedProbeResult>> = [];
  const startedAt = performance.now();

  await request.hydrate(async () => {
    setStore("session", (draft: SessionState) => {
      draft.count += 1;
      draft.trail.push("render");
    });

    await Promise.resolve();
    setStore("session", (draft: SessionState) => {
      draft.count += 1;
      draft.trail.push("render-microtask");
    });

    detached.push(
      (async () => {
        await wait(0);
        return {
          carrier: getRequestCarrier(),
          snapshot: getStore("session"),
        };
      })(),
      (async () => {
        await nextImmediate();
        return {
          carrier: getRequestCarrier(),
          snapshot: getStore("session"),
        };
      })(),
    );
  });

  const actionScope = createRequestScope(request.capture());
  const actionResult = await actionScope.run(async (api) => {
    await Promise.resolve();
    api.set("session", (draft) => {
      draft.count += 1;
      draft.trail.push("server-action");
    });
    await wait(0);
    return api.get("session");
  });

  assert.deepStrictEqual(actionResult, {
    provider: "vercel",
    requestId,
    count: 3,
    trail: ["seed", "render", "render-microtask", "server-action"],
  });
  assert.strictEqual(hasStore("session"), false);

  return {
    durationMs: round(performance.now() - startedAt),
    detached: await Promise.all(detached),
  };
};

const runWorkersInvocation = async (requestId: number): Promise<{ durationMs: number; detached: DetachedProbeResult[] }> => {
  const request = createRequestScope<{ session: SessionState }>({
    snapshot: {
      session: buildSession(requestId, "cloudflare_workers"),
    },
    options: {},
  });
  const startedAt = performance.now();

  const result = await request.run(async (api) => {
    await Promise.resolve();
    api.set("session", (draft) => {
      draft.count += 1;
      draft.trail.push("fetch");
    });

    await wait(0);
    api.set("session", (draft) => {
      draft.count += 1;
      draft.trail.push("timer");
    });

    return api.get("session");
  });

  assert.deepStrictEqual(result, {
    provider: "cloudflare_workers",
    requestId,
    count: 2,
    trail: ["seed", "fetch", "timer"],
  });
  assert.strictEqual(hasStore("session"), false);

  return {
    durationMs: round(performance.now() - startedAt),
    detached: [],
  };
};

const certifyProvider = async (args: {
  provider: ProviderResult["provider"];
  runtimeModel: string;
  runInvocation: (requestId: number) => Promise<{ durationMs: number; detached: DetachedProbeResult[] }>;
}): Promise<ProviderResult> => {
  resetAllStoresForTest();
  maybeGc();
  const baselineHeapMb = heapMb();
  const durations: number[] = [];
  let detachedLeakCount = 0;
  let globalResidualCount = 0;

  for (let requestId = 1; requestId <= INVOCATIONS; requestId += 1) {
    const result = await args.runInvocation(requestId);
    durations.push(result.durationMs);

    result.detached.forEach((probe) => {
      const carrierHasSession = Object.prototype.hasOwnProperty.call(probe.carrier ?? {}, "session");
      const snapshotVisible = probe.snapshot !== null && probe.snapshot !== undefined;
      if (carrierHasSession || snapshotVisible) {
        detachedLeakCount += 1;
      }
    });

    if (hasGlobalResidualState()) {
      globalResidualCount += 1;
    }
  }

  maybeGc();
  const retainedGrowthMb = round(heapMb() - baselineHeapMb);
  const globalStoreCountAfterRun = listStores().length;

  assert.strictEqual(detachedLeakCount, 0, `${args.provider} leaked detached state ${detachedLeakCount} time(s)`);
  assert.strictEqual(globalResidualCount, 0, `${args.provider} polluted the global registry ${globalResidualCount} time(s)`);
  assert.strictEqual(globalStoreCountAfterRun, 0, `${args.provider} left ${globalStoreCountAfterRun} global store(s) behind`);
  assert.ok(
    retainedGrowthMb <= MAX_RETAINED_GROWTH_MB,
    `${args.provider} retained ${retainedGrowthMb} MB`,
  );

  return {
    provider: args.provider,
    runtimeModel: args.runtimeModel,
    invocations: INVOCATIONS,
    detachedProbes: INVOCATIONS * (args.provider === "cloudflare_workers" ? 0 : 2),
    timing: summarizeSamples(durations),
    retainedGrowthMb,
    invariants: {
      detachedLeakCount,
      globalResidualCount,
      globalStoreCountAfterRun,
    },
  };
};

export const runServerlessProviderCertification = async (): Promise<BenchmarkResult> => {
  const providers = [
    await certifyProvider({
      provider: "aws_lambda",
      runtimeModel: "warm Node handler with AsyncLocalStorage request scope",
      runInvocation: runLambdaInvocation,
    }),
    await certifyProvider({
      provider: "vercel",
      runtimeModel: "warm Node render plus explicit portable server-action hand-off",
      runInvocation: runVercelInvocation,
    }),
    await certifyProvider({
      provider: "cloudflare_workers",
      runtimeModel: "warm worker isolate with explicit portable request scope",
      runInvocation: runWorkersInvocation,
    }),
  ];

  return {
    name: "Serverless Provider Model Certification",
    providers,
    totalInvocations: providers.reduce((sum, provider) => sum + provider.invocations, 0),
  };
};

const main = async () => {
  const result = await runServerlessProviderCertification();
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
