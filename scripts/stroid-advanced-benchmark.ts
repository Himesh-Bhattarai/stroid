import { performance } from "node:perf_hooks";
import {
  _subscribe,
  clearAllStores,
  createStore,
  getStore,
  setStore,
  deleteStore,
} from "../src/store.js";
import { subscribeWithSelector } from "../src/selectors.js";
import { listStores } from "../src/runtime-tools.js";
import { fetchStore } from "../src/async.js";
import { installDevtools, installSync } from "../src/install.js";

type ScaleRow = {
  count: number;
  rawMs?: number;
  simpleSelectorMs?: number;
  complexSelectorMs?: number;
  rawHeapMb?: number;
  simpleHeapMb?: number;
  complexHeapMb?: number;
};

type DeepRow = { count: number; singleAvgMs: number };
type RegistryRow = { stores: number; setMs: number; listMs: number };
type SyncRow = { peers: number; stores: number; latencyMs: number; syncStateMessages: number; converged: boolean };

const maybeGc = (): void => {
  if (typeof global.gc === "function") global.gc();
};

const heapMb = (): number => process.memoryUsage().heapUsed / (1024 * 1024);
const round = (value: number): number => Number(value.toFixed(3));
let sink = 0;

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const COUNTS = [50_000, 100_000, 200_000, 900_000, 1_100_000];

const withTimeout = async <T>(label: string, promise: Promise<T>, ms: number): Promise<T | { error: string }> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ error: string }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ error: `timeout after ${ms}ms (${label})` }), ms);
  });
  const result = await Promise.race([promise, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
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

const uniqueNoop = () => () => {
  sink += 0;
};

const seedDeepState = () => ({
  value: 0,
  other: 0,
  deep: {
    a: {
      b: {
        c: {
          d: {
            e: 1,
            f: 2,
            g: 3,
          },
        },
      },
    },
  },
});

const benchSelectorScale = async (): Promise<ScaleRow[]> => {
  const rows: ScaleRow[] = [];

  for (const count of COUNTS) {
    const row: ScaleRow = { count };

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
    row.rawMs = round(rawSamples.reduce((sum, value) => sum + value, 0) / rawSamples.length);
    rawMarker.dispose();
    clearAllStores();

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
    row.simpleSelectorMs = round(simpleSamples.reduce((sum, value) => sum + value, 0) / simpleSamples.length);
    simpleMarker.dispose();
    clearAllStores();

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
    const complexMarker = createMarker("complexSelectorBench");
    await complexMarker.update(1, () => setStore("complexSelectorBench", "deep.a.b.c.d.e", 10));
    const complexSamples: number[] = [];
    for (let i = 2; i <= 4; i++) {
      complexSamples.push(await complexMarker.update(i, () => setStore("complexSelectorBench", "deep.a.b.c.d.e", i)));
    }
    row.complexSelectorMs = round(complexSamples.reduce((sum, value) => sum + value, 0) / complexSamples.length);
    complexMarker.dispose();
    clearAllStores();

    rows.push(row);
  }

  return rows;
};

const benchDeepUpdates = async (): Promise<DeepRow[]> => {
  const counts = [50_000, 100_000, 150_000, 200_000, 250_000, 900_000, 1_100_000];
  const rows: DeepRow[] = [];

  for (const count of counts) {
    clearAllStores();
    createStore("deepBench", seedDeepState(), { scope: "global", devtools: { historyLimit: 0 } });
    for (let i = 0; i < count; i++) _subscribe("deepBench", uniqueNoop());
    const marker = createMarker("deepBench");
    await marker.update(1, () => setStore("deepBench", "value", 1));
    const samples: number[] = [];
    for (let i = 2; i <= 4; i++) {
      samples.push(await marker.update(i, () => setStore("deepBench", "deep.a.b.c.d.e", i)));
    }
    rows.push({
      count,
      singleAvgMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
    });
    marker.dispose();
    clearAllStores();
  }

  return rows;
};

const benchRegistryScale = async (): Promise<RegistryRow[]> => {
  const storeCounts = [1_000, 5_000, 10_000, 25_000];
  const rows: RegistryRow[] = [];

  for (const stores of storeCounts) {
    clearAllStores();
    for (let i = 0; i < stores; i++) {
      createStore(`registry-${i}`, { value: i }, { scope: "global", devtools: { historyLimit: 0 } });
    }

    const target = `registry-${stores - 1}`;
    const marker = createMarker(target);
    const setSamples: number[] = [];
    for (let i = 0; i < 3; i++) {
      setSamples.push(await marker.update(10_000 + i, () => setStore(target, { value: 10_000 + i })));
    }

    const listStart = performance.now();
    listStores();
    const listMs = performance.now() - listStart;

    rows.push({
      stores,
      setMs: round(setSamples.reduce((sum, value) => sum + value, 0) / setSamples.length),
      listMs: round(listMs),
    });

    marker.dispose();
    clearAllStores();
  }

  return rows;
};

const benchLeakCheck = async () => {
  const cycles = 20;
  const subscribers = 100_000;

  maybeGc();
  const before = heapMb();

  for (let cycle = 0; cycle < cycles; cycle++) {
    createStore("leakBench", { value: cycle }, { scope: "global", devtools: { historyLimit: 0 } });
    for (let i = 0; i < subscribers; i++) _subscribe("leakBench", uniqueNoop());
    deleteStore("leakBench");
    maybeGc();
  }

  const after = heapMb();
  return {
    cycles,
    subscribersPerCycle: subscribers,
    retainedDeltaMb: round(after - before),
  };
};

const benchSelectorConsistency = async () => {
  clearAllStores();
  createStore("selectorConsistency", { value: 0, other: 0 }, { scope: "global", devtools: { historyLimit: 0 } });

  let relatedCalls = 0;
  let unrelatedCalls = 0;
  subscribeWithSelector(
    "selectorConsistency",
    (state) => state.value,
    Object.is,
    () => {
      relatedCalls += 1;
    },
  );

  for (let i = 0; i < 100; i++) {
    setStore("selectorConsistency", { other: i });
  }
  await wait();
  unrelatedCalls = relatedCalls;

  for (let i = 0; i < 100; i++) {
    setStore("selectorConsistency", { value: i + 1 });
    await wait();
  }

  const afterSequential = relatedCalls;
  for (let i = 0; i < 100; i++) {
    setStore("selectorConsistency", { value: 1_000 + i });
  }
  await wait();
  const afterBurst = relatedCalls;

  clearAllStores();
  return {
    unrelatedCalls,
    sequentialRelatedCalls: afterSequential - unrelatedCalls,
    burstCalls: afterBurst - afterSequential,
  };
};

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();
  static sent: Array<{ channel: string; data: any }> = [];

  readonly name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>();
    peers.add(this);
    MockBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: any) {
    MockBroadcastChannel.sent.push({ channel: this.name, data });
    const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set<MockBroadcastChannel>();
    peers.forEach((peer) => {
      if (peer === this) return;
      queueMicrotask(() => {
        peer.onmessage?.({ data } as MessageEvent);
      });
    });
  }

  close() {
    const peers = MockBroadcastChannel.channels.get(this.name);
    peers?.delete(this);
    if (peers?.size === 0) {
      MockBroadcastChannel.channels.delete(this.name);
    }
  }

  static reset() {
    MockBroadcastChannel.channels.clear();
    MockBroadcastChannel.sent = [];
  }
}

const benchSyncScale = async (): Promise<SyncRow[]> => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;
  (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const scenarios = [
    { peers: 2, stores: 1 },
    { peers: 5, stores: 1 },
    { peers: 10, stores: 1 },
    { peers: 20, stores: 1 },
    { peers: 20, stores: 10 },
  ];

  const rows: SyncRow[] = [];

  try {
    for (const scenario of scenarios) {
      MockBroadcastChannel.reset();
      const peers = [];
      for (let i = 0; i < scenario.peers; i++) {
        peers.push(await import(`../src/store.js?sync-scale-${scenario.peers}-${scenario.stores}-${i}-${Date.now()}`));
      }

      for (const peer of peers) {
        for (let storeIndex = 0; storeIndex < scenario.stores; storeIndex++) {
          peer.createStore(`shared-${storeIndex}`, { value: "seed" }, { sync: true });
        }
      }

      await wait();
      await wait();
      MockBroadcastChannel.sent = [];

      const start = performance.now();
      peers[0].setStore("shared-0", { value: "updated" });

      let converged = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await wait();
        converged = peers.every((peer) => {
          const value = peer.getStore("shared-0");
          return value?.value === "updated";
        });
        if (converged) break;
      }

      const latencyMs = performance.now() - start;
      rows.push({
        peers: scenario.peers,
        stores: scenario.stores,
        latencyMs: round(latencyMs),
        syncStateMessages: MockBroadcastChannel.sent.filter((entry) => entry.data?.type === "sync-state" && entry.data?.name === "shared-0").length,
        converged,
      });

      for (const peer of peers) peer.clearAllStores();
    }
  } finally {
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }

  return rows;
};

const benchConflictDeterminism = async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;
  (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  let mismatches = 0;
  const rounds = 50;

  try {
    const first = await import(`../src/store.js?conflict-first-${Date.now()}`);
    const second = await import(`../src/store.js?conflict-second-${Date.now()}`);

    first.createStore("shared", { value: "seed" }, { sync: true });
    second.createStore("shared", { value: "seed" }, { sync: true });
    await wait();

    const channels = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? []);
    const [firstChannel, secondChannel] = channels;

    for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
      first.setStore("shared", { value: "seed" });
      second.setStore("shared", { value: "seed" });
      await wait();

      const messageA = {
        type: "sync-state",
        source: "writer-a",
        name: "shared",
        clock: 1,
        updatedAt: 100,
        data: { value: "A" },
      };
      const messageB = {
        type: "sync-state",
        source: "writer-b",
        name: "shared",
        clock: 1,
        updatedAt: 100,
        data: { value: "B" },
      };

      firstChannel.onmessage?.({ data: messageA } as MessageEvent);
      firstChannel.onmessage?.({ data: messageB } as MessageEvent);
      secondChannel.onmessage?.({ data: messageB } as MessageEvent);
      secondChannel.onmessage?.({ data: messageA } as MessageEvent);
      await wait();

      if (first.getStore("shared")?.value !== second.getStore("shared")?.value) {
        mismatches += 1;
      }
    }

    first.clearAllStores();
    second.clearAllStores();
  } finally {
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }

  return { rounds, mismatches };
};

const benchLifecycleOverhead = async () => {
  const subscribers = 100_000;

  const measure = async (name: string, options: Record<string, unknown>) => {
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
    return round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  };

  const baseMs = await measure("lifecycleBase", {});
  const hookMs = await measure("lifecycleHook", {
    lifecycle: {
      onSet: () => {
        sink += 1;
      },
    },
  });
  const middlewareMs = await measure("lifecycleMiddleware", {
    lifecycle: {
      middleware: [({ next }) => next],
    },
  });

  const realFetch = globalThis.fetch;
  clearAllStores();
  createStore("asyncBench", { data: null, loading: false, error: null, status: "idle" }, { scope: "global", devtools: { historyLimit: 0 } });
  for (let i = 0; i < subscribers; i++) _subscribe("asyncBench", uniqueNoop());
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => ({ value: "ok" }),
    text: async () => JSON.stringify({ value: "ok" }),
  })) as typeof fetch;
  const asyncStart = performance.now();
  await fetchStore("asyncBench", "https://example.com/value", { dedupe: false });
  const asyncMs = performance.now() - asyncStart;
  globalThis.fetch = realFetch;
  clearAllStores();

  return {
    subscribers,
    baseMs,
    hookMs,
    middlewareMs,
    asyncHelperMs: round(asyncMs),
  };
};

type RunMode = "full" | "lite";

const resolveRunMode = (): RunMode => {
  const args = process.argv.slice(2);
  const explicit = args.find((arg) => arg.startsWith("--mode="));
  if (explicit) {
    const value = explicit.split("=")[1];
    return value === "lite" ? "lite" : "full";
  }
  if (args.includes("--lite")) return "lite";
  return "full";
};

const main = async () => {
  installSync();
  installDevtools();
  const runMode = resolveRunMode();
  const skippedSections: string[] = [];

  maybeGc();
  const selectorScale = runMode === "full"
    ? await withTimeout("selectorScale", benchSelectorScale(), 600000)
    : (skippedSections.push("selectorScale"), null);
  maybeGc();
  const deepUpdates = runMode === "full"
    ? await withTimeout("deepUpdates", benchDeepUpdates(), 600000)
    : (skippedSections.push("deepUpdates"), null);
  maybeGc();
  const registryScale = runMode === "full"
    ? await withTimeout("registryScale", benchRegistryScale(), 300000)
    : (skippedSections.push("registryScale"), null);
  maybeGc();
  const leakCheck = runMode === "full"
    ? await withTimeout("leakCheck", benchLeakCheck(), 300000)
    : (skippedSections.push("leakCheck"), null);
  maybeGc();
  const selectorConsistency = runMode === "full"
    ? await withTimeout("selectorConsistency", benchSelectorConsistency(), 120000)
    : (skippedSections.push("selectorConsistency"), null);
  maybeGc();
  const syncScale = await withTimeout("syncScale", benchSyncScale(), 300000);
  maybeGc();
  const conflictDeterminism = runMode === "full"
    ? await withTimeout("conflictDeterminism", benchConflictDeterminism(), 300000)
    : (skippedSections.push("conflictDeterminism"), null);
  maybeGc();
  const lifecycleOverhead = await withTimeout("lifecycleOverhead", benchLifecycleOverhead(), 300000);

  return {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    runMode,
    skippedSections,
    selectorScale,
    deepUpdates,
    registryScale,
    leakCheck,
    selectorConsistency,
    syncScale,
    conflictDeterminism,
    lifecycleOverhead,
  };
};

main()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
