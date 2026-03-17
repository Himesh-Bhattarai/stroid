import { performance } from "node:perf_hooks";
import { _subscribe, clearAllStores, createStore, setStore } from "../src/store.js";
import "../src/devtools.js";

type Row = {
  count: number;
  singleAvgMs: number;
};

const round = (value: number): number => Number(value.toFixed(3));
let sink = 0;

const uniqueNoop = () => () => {
  sink += 0;
};

const seedDeepState = () => ({
  value: 0,
  other: 0,
  deep: { a: { b: { c: { d: { e: 1, f: 2, g: 3 } } } } },
});

const createMarker = (name: string, readValue: (state: any) => number = (state) => state?.value) => {
  let expected = 0;
  let resolver: (() => void) | null = null;
  let endTime = 0;

  const off = _subscribe(name, (state: any) => {
    if (readValue(state) !== expected || resolver === null) return;
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

const main = async () => {
  const counts = [50_000, 100_000, 150_000, 200_000, 250_000, 800_000];
  const rows: Row[] = [];

  for (const count of counts) {
    clearAllStores();
    createStore("deepBench", seedDeepState(), { scope: "global", devtools: { historyLimit: 0 } });
    for (let i = 0; i < count; i++) _subscribe("deepBench", uniqueNoop());
    const marker = createMarker("deepBench", (state) => state?.deep?.a?.b?.c?.d?.e);
    await marker.update(1, () => setStore("deepBench", { value: 1 }));
    const samples: number[] = [];
    for (let i = 2; i <= 4; i++) {
      samples.push(await marker.update(i, () => setStore("deepBench", "deep.a.b.c.d.e", i)));
    }
    rows.push({
      count,
      singleAvgMs: round(average(samples)),
    });
    marker.dispose();
    clearAllStores();
  }

  console.log(JSON.stringify(rows, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
