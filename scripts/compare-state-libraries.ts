import { performance } from "node:perf_hooks";
import { createStore as createReduxStore } from "redux";
import { produce } from "immer";
import { createStore as createZustandStore } from "zustand/vanilla";
import { _subscribe, clearAllStores, createStore, setStore } from "../src/store.js";

type Library = "stroid" | "redux-plain" | "redux-immer" | "zustand";

type ResultRow = {
  library: Library;
  subscribers: number;
  singleAvgMs: number;
  batch100Ms: number;
  heapDeltaMb: number;
  bytesPerSubscriber: number;
};

const COUNTS = [50_000, 100_000, 200_000];
let sink = 0;

const maybeGc = (): void => {
  if (typeof global.gc === "function") {
    global.gc();
  }
};

const heapMb = (): number => process.memoryUsage().heapUsed / (1024 * 1024);
const round = (value: number): number => Number(value.toFixed(3));

const makeUniqueNoop = () => () => {
  sink += 0;
};

const benchStroid = async (subscribers: number): Promise<ResultRow> => {
  clearAllStores();
  createStore("compareStore", { value: 0 }, { scope: "global", devtools: { historyLimit: 0 } });

  maybeGc();
  const beforeHeap = heapMb();
  for (let i = 0; i < subscribers; i++) {
    _subscribe("compareStore", makeUniqueNoop());
  }
  maybeGc();
  const afterHeap = heapMb();

  let expected = 0;
  let resolver: (() => void) | null = null;
  let endTime = 0;
  const done = _subscribe("compareStore", (state: any) => {
    if (state?.value !== expected || resolver === null) return;
    endTime = performance.now();
    const current = resolver;
    resolver = null;
    current();
  });

  const updateAndWait = async (value: number): Promise<number> => {
    expected = value;
    const completion = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    const start = performance.now();
    setStore("compareStore", { value });
    await completion;
    return endTime - start;
  };

  await updateAndWait(1);
  const singles: number[] = [];
  for (let i = 2; i <= 4; i++) {
    singles.push(await updateAndWait(i));
  }

  const batchStart = performance.now();
  for (let i = 5; i < 105; i++) {
    await updateAndWait(i);
  }
  const batch100Ms = performance.now() - batchStart;

  done();
  clearAllStores();

  return {
    library: "stroid",
    subscribers,
    singleAvgMs: round(singles.reduce((sum, value) => sum + value, 0) / singles.length),
    batch100Ms: round(batch100Ms),
    heapDeltaMb: round(afterHeap - beforeHeap),
    bytesPerSubscriber: round(((afterHeap - beforeHeap) * 1024 * 1024) / subscribers),
  };
};

const benchRedux = async (subscribers: number, immerMode: boolean): Promise<ResultRow> => {
  type State = { value: number };
  const reducer = immerMode
    ? (state: State = { value: 0 }, action: { type: string; value: number }) =>
        action.type === "set"
          ? produce(state, (draft) => {
              draft.value = action.value;
            })
          : state
    : (state: State = { value: 0 }, action: { type: string; value: number }) =>
        action.type === "set" ? { value: action.value } : state;

  const store = createReduxStore(reducer);

  maybeGc();
  const beforeHeap = heapMb();
  for (let i = 0; i < subscribers; i++) {
    store.subscribe(makeUniqueNoop());
  }
  maybeGc();
  const afterHeap = heapMb();

  let expected = 0;
  let endTime = 0;
  const unsubscribeMarker = store.subscribe(() => {
    if (store.getState().value !== expected) return;
    endTime = performance.now();
  });

  const updateAndMeasure = (value: number): number => {
    expected = value;
    const start = performance.now();
    store.dispatch({ type: "set", value });
    return endTime - start;
  };

  updateAndMeasure(1);
  const singles: number[] = [];
  for (let i = 2; i <= 4; i++) {
    singles.push(updateAndMeasure(i));
  }

  const batchStart = performance.now();
  for (let i = 5; i < 105; i++) {
    updateAndMeasure(i);
  }
  const batch100Ms = performance.now() - batchStart;
  unsubscribeMarker();

  return {
    library: immerMode ? "redux-immer" : "redux-plain",
    subscribers,
    singleAvgMs: round(singles.reduce((sum, value) => sum + value, 0) / singles.length),
    batch100Ms: round(batch100Ms),
    heapDeltaMb: round(afterHeap - beforeHeap),
    bytesPerSubscriber: round(((afterHeap - beforeHeap) * 1024 * 1024) / subscribers),
  };
};

const benchZustand = async (subscribers: number): Promise<ResultRow> => {
  const store = createZustandStore<{ value: number }>()(() => ({ value: 0 }));

  maybeGc();
  const beforeHeap = heapMb();
  for (let i = 0; i < subscribers; i++) {
    store.subscribe(makeUniqueNoop());
  }
  maybeGc();
  const afterHeap = heapMb();

  let expected = 0;
  let endTime = 0;
  const unsubscribeMarker = store.subscribe((state) => {
    if (state.value !== expected) return;
    endTime = performance.now();
  });

  const updateAndMeasure = (value: number): number => {
    expected = value;
    const start = performance.now();
    store.setState({ value });
    return endTime - start;
  };

  updateAndMeasure(1);
  const singles: number[] = [];
  for (let i = 2; i <= 4; i++) {
    singles.push(updateAndMeasure(i));
  }

  const batchStart = performance.now();
  for (let i = 5; i < 105; i++) {
    updateAndMeasure(i);
  }
  const batch100Ms = performance.now() - batchStart;
  unsubscribeMarker();

  return {
    library: "zustand",
    subscribers,
    singleAvgMs: round(singles.reduce((sum, value) => sum + value, 0) / singles.length),
    batch100Ms: round(batch100Ms),
    heapDeltaMb: round(afterHeap - beforeHeap),
    bytesPerSubscriber: round(((afterHeap - beforeHeap) * 1024 * 1024) / subscribers),
  };
};

const main = async () => {
  const results: ResultRow[] = [];

  for (const subscribers of COUNTS) {
    maybeGc();
    results.push(await benchStroid(subscribers));
    maybeGc();
    results.push(await benchRedux(subscribers, false));
    maybeGc();
    results.push(await benchRedux(subscribers, true));
    maybeGc();
    results.push(await benchZustand(subscribers));
    maybeGc();
  }

  console.log(JSON.stringify({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      counts: COUNTS,
      note: "Stroid numbers are measured end-to-end until its async notification flush reaches a final marker subscriber; Redux and Zustand notify synchronously inside dispatch/setState.",
    },
    results,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
