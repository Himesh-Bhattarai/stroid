import { performance } from "node:perf_hooks";
import { _subscribe, clearAllStores, createStore, setStore } from "../src/store.js";
import { fetchStore } from "../src/async.js";
import "../src/devtools/index.js";

const round = (value: number): number => Number(value.toFixed(3));
let sink = 0;

const uniqueNoop = () => () => {
  sink += 0;
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

const measure = async (name: string, options: Record<string, unknown>, subscribers: number) => {
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
  return round(average(samples));
};

const main = async () => {
  const subscribers = 100_000;
  const baseMs = await measure("lifecycleBase", {}, subscribers);
  const hookMs = await measure("lifecycleHook", {
    lifecycle: {
      onSet: () => {
        sink += 1;
      },
    },
  }, subscribers);
  const middlewareMs = await measure("lifecycleMiddleware", {
    lifecycle: {
      middleware: [({ next }: any) => next],
    },
  }, subscribers);

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
