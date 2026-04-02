import { performance } from "node:perf_hooks";
import { _subscribe, clearAllStores, createStore, setStore } from "../src/store.js";
import { fetchStore } from "../src/async.js";
import { installDevtools } from "../src/install.js";
import type { MiddlewareCtx } from "../src/adapters/options.js";

const round = (value: number): number => Number(value.toFixed(3));
let sink = 0;

const uniqueNoop = () => () => {
  sink += 0;
};

const maybeGc = (): void => {
  if (typeof global.gc === "function") global.gc();
};

const createMarker = (name: string) => {
  let expected = 0;
  let resolver: (() => void) | null = null;
  let endTime = 0;

  const off = _subscribe(name, (state: any) => {
    if (state?.value !== expected || resolver === null) return;
    endTime = performance.now();
    const current = resolver;
    resolver = null;
    current();
  });

  return {
    async update(value: number, updater: () => void): Promise<number> {
      expected = value;
      const completion = new Promise<void>((resolve) => {
        resolver = resolve;
      });
      const start = performance.now();
      updater();
      await completion;
      return endTime - start;
    },
    dispose: off,
  };
};

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const measureOnce = async (name: string, options: Record<string, unknown>, subscribers: number): Promise<number> => {
  clearAllStores();
  createStore(name, { value: 0 }, { scope: "global", devtools: { historyLimit: 0 }, ...options });
  for (let i = 0; i < subscribers; i++) _subscribe(name, uniqueNoop());
  const marker = createMarker(name);
  await marker.update(1, () => setStore(name, { value: 1 }));
  const samples: number[] = [];
  for (let i = 2; i <= 4; i++) {
    samples.push(await marker.update(i, () => setStore(name, { value: i })));
  }
  marker.dispose();
  clearAllStores();
  return average(samples);
};

const main = async () => {
  installDevtools();
  maybeGc();
  const subscribers = 100_000;

  const runs = 3;
  const warmup = async (label: string, options: Record<string, unknown>) => {
    await measureOnce(`${label}-warmup`, options, Math.min(10_000, subscribers));
    maybeGc();
  };

  const measureScenario = async (label: string, options: Record<string, unknown>): Promise<number> => {
    await warmup(label, options);
    const samples: number[] = [];
    for (let run = 0; run < runs; run += 1) {
      samples.push(await measureOnce(`${label}-${run}`, options, subscribers));
      maybeGc();
    }
    return round(median(samples));
  };

  const baseMs = await measureScenario("lifecycleBase", {});
  const hookMs = await measureScenario(
    "lifecycleHook",
    {
      lifecycle: {
        onSet: () => {
          sink += 1;
        },
      },
    },
  );
  const middlewareMs = await measureScenario(
    "lifecycleMiddleware",
    {
      lifecycle: {
        middleware: [({ next }: MiddlewareCtx) => next],
      },
    },
  );

  const realFetch = globalThis.fetch;
  clearAllStores();
  createStore("asyncBench", { data: null, loading: false, error: null, status: "idle" }, {
    scope: "global",
    devtools: { historyLimit: 0 },
  });
  for (let i = 0; i < subscribers; i++) _subscribe("asyncBench", uniqueNoop());
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ value: "ok" }),
      text: async () => JSON.stringify({ value: "ok" }),
    }) as Response) as typeof fetch;

  const asyncStart = performance.now();
  await fetchStore("asyncBench", "https://example.com/value", { dedupe: false });
  const asyncHelperMs = round(performance.now() - asyncStart);
  globalThis.fetch = realFetch;
  clearAllStores();

  console.log(
    JSON.stringify(
      {
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          runs,
          warmupSubscribers: Math.min(10_000, subscribers),
        },
        subscribers,
        baseMs,
        hookMs,
        middlewareMs,
        asyncHelperMs,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
