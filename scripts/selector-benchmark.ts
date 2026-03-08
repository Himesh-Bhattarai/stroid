import { performance } from "node:perf_hooks";
import {
  _subscribe,
  clearAllStores,
  createStore,
  setStore,
  subscribeWithSelector,
} from "../src/store.js";

type Row = {
  count: number;
  rawMs: number;
  rawHeapMb: number;
  simpleSelectorMs: number;
  simpleHeapMb: number;
  complexSelectorMs: number;
  complexHeapMb: number;
};

const round = (value: number): number => Number(value.toFixed(3));
const heapMb = (): number => process.memoryUsage().heapUsed / (1024 * 1024);
const maybeGc = (): void => {
  if (typeof global.gc === "function") global.gc();
};

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
  const counts = [50_000, 100_000, 200_000];
  const rows: Row[] = [];

  for (const count of counts) {
    const row = {} as Row;
    row.count = count;

    clearAllStores();
    createStore("rawBench", { value: 0 }, { scope: "global", devtools: { historyLimit: 0 } });
    maybeGc();
    const rawBefore = heapMb();
    for (let i = 0; i < count; i++) _subscribe("rawBench", uniqueNoop());
    maybeGc();
    row.rawHeapMb = round(heapMb() - rawBefore);
    const rawMarker = createMarker("rawBench");
    await rawMarker.update(1, () => setStore("rawBench", { value: 1 }));
    const rawSamples: number[] = [];
    for (let i = 2; i <= 4; i++) rawSamples.push(await rawMarker.update(i, () => setStore("rawBench", { value: i })));
    row.rawMs = round(average(rawSamples));
    rawMarker.dispose();
    clearAllStores();

    createStore("simpleSelectorBench", { value: 0, other: 0 }, { scope: "global", devtools: { historyLimit: 0 } });
    maybeGc();
    const simpleBefore = heapMb();
    for (let i = 0; i < count; i++) {
      subscribeWithSelector("simpleSelectorBench", (state) => state.value, Object.is, uniqueNoop());
    }
    maybeGc();
    row.simpleHeapMb = round(heapMb() - simpleBefore);
    const simpleMarker = createMarker("simpleSelectorBench");
    await simpleMarker.update(1, () => setStore("simpleSelectorBench", { value: 1 }));
    const simpleSamples: number[] = [];
    for (let i = 2; i <= 4; i++) {
      simpleSamples.push(await simpleMarker.update(i, () => setStore("simpleSelectorBench", { value: i })));
    }
    row.simpleSelectorMs = round(average(simpleSamples));
    simpleMarker.dispose();
    clearAllStores();

    createStore("complexSelectorBench", seedDeepState(), { scope: "global", devtools: { historyLimit: 0 } });
    maybeGc();
    const complexBefore = heapMb();
    for (let i = 0; i < count; i++) {
      subscribeWithSelector(
        "complexSelectorBench",
        (state) => state.deep.a.b.c.d.e + state.deep.a.b.c.d.f + state.deep.a.b.c.d.g + state.value,
        Object.is,
        uniqueNoop(),
      );
    }
    maybeGc();
    row.complexHeapMb = round(heapMb() - complexBefore);
    const complexMarker = createMarker("complexSelectorBench", (state) => state?.deep?.a?.b?.c?.d?.e);
    await complexMarker.update(1, () => setStore("complexSelectorBench", "deep.a.b.c.d.e", 1));
    const complexSamples: number[] = [];
    for (let i = 2; i <= 4; i++) {
      complexSamples.push(await complexMarker.update(i, () => setStore("complexSelectorBench", "deep.a.b.c.d.e", i)));
    }
    row.complexSelectorMs = round(average(complexSamples));
    complexMarker.dispose();
    clearAllStores();

    rows.push(row);
  }

  console.log(JSON.stringify(rows, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
