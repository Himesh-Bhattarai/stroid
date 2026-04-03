import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { installSync } from "../src/install.js";

type SyncRow = {
  peers: number;
  stores: number;
  latencyMs: number;
  syncStateMessages: number;
  converged: boolean;
};

const round = (value: number): number => Number(value.toFixed(3));
const wait = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type WindowShim = { addEventListener: () => void; removeEventListener: () => void };
type GlobalShim = { window?: unknown; BroadcastChannel?: unknown };
const getGlobalShim = (): GlobalShim => globalThis as unknown as GlobalShim;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isSyncStateMessage = (value: unknown): value is { type: "sync-state"; name: string } =>
  isRecord(value) && value.type === "sync-state" && typeof value.name === "string";

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();
  static sent: Array<{ channel: string; data: unknown }> = [];

  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>();
    peers.add(this);
    MockBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: unknown) {
    MockBroadcastChannel.sent.push({ channel: this.name, data });
    const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set<MockBroadcastChannel>();
    peers.forEach((peer) => {
      if (peer === this) return;
      queueMicrotask(() => {
        peer.onmessage?.({ data } as MessageEvent<unknown>);
      });
    });
  }

  close() {
    const peers = MockBroadcastChannel.channels.get(this.name);
    peers?.delete(this);
    if (peers?.size === 0) MockBroadcastChannel.channels.delete(this.name);
  }

  static reset() {
    MockBroadcastChannel.channels.clear();
    MockBroadcastChannel.sent = [];
  }
}

const benchSyncScale = async (): Promise<SyncRow[]> => {
  const globalShim = getGlobalShim();
  const originalWindow = globalShim.window;
  const originalBroadcastChannel = globalShim.BroadcastChannel;
  globalShim.window = { addEventListener: () => {}, removeEventListener: () => {} } satisfies WindowShim;
  globalShim.BroadcastChannel = MockBroadcastChannel;

  const scenarios = [
    { peers: 2, stores: 1 },
    { peers: 5, stores: 1 },
    { peers: 10, stores: 1 },
    { peers: 20, stores: 1 },
    { peers: 20, stores: 10 },
  ];

  const rows: SyncRow[] = [];
  const storeUrl = pathToFileURL(`${process.cwd()}\\src\\store.ts`).href;

  try {
    for (const scenario of scenarios) {
      MockBroadcastChannel.reset();
      type StoreModule = typeof import("../src/store.js");
      const peers: StoreModule[] = [];
      for (let i = 0; i < scenario.peers; i++) {
        peers.push(await import(`${storeUrl}?sync-scale-${scenario.peers}-${scenario.stores}-${i}-${Date.now()}`) as StoreModule);
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
      for (let attempt = 0; attempt < 200; attempt++) {
        await wait();
        converged = peers.every((peer) => peer.getStore("shared-0")?.value === "updated");
        if (converged) break;
      }

      rows.push({
        peers: scenario.peers,
        stores: scenario.stores,
        latencyMs: round(performance.now() - start),
        syncStateMessages: MockBroadcastChannel.sent.filter(
          (entry) => isSyncStateMessage(entry.data) && entry.data.name === "shared-0",
        ).length,
        converged,
      });

      for (const peer of peers) peer.clearAllStores();
    }
  } finally {
    MockBroadcastChannel.reset();
    globalShim.window = originalWindow;
    globalShim.BroadcastChannel = originalBroadcastChannel;
  }

  return rows;
};

const benchConflictDeterminism = async () => {
  const globalShim = getGlobalShim();
  const originalWindow = globalShim.window;
  const originalBroadcastChannel = globalShim.BroadcastChannel;
  globalShim.window = { addEventListener: () => {}, removeEventListener: () => {} } satisfies WindowShim;
  globalShim.BroadcastChannel = MockBroadcastChannel;

  const rounds = 50;
  let mismatches = 0;
  const storeUrl = pathToFileURL(`${process.cwd()}\\src\\store.ts`).href;
  type ConflictCandidate<T> = { updatedAt: number; data: T };

  try {
    const first = await import(`${storeUrl}?conflict-first-${Date.now()}`);
    const second = await import(`${storeUrl}?conflict-second-${Date.now()}`);

    first.createStore("shared", { value: "seed" }, {
      sync: true,
      conflictResolver: (local: ConflictCandidate<{ value: string }>, remote: ConflictCandidate<{ value: string }>) =>
        (local.updatedAt >= remote.updatedAt ? local.data : remote.data),
    });
    second.createStore("shared", { value: "seed" }, {
      sync: true,
      conflictResolver: (local: ConflictCandidate<{ value: string }>, remote: ConflictCandidate<{ value: string }>) =>
        (local.updatedAt >= remote.updatedAt ? local.data : remote.data),
    });

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

      firstChannel?.onmessage?.({ data: messageA } as MessageEvent);
      firstChannel?.onmessage?.({ data: messageB } as MessageEvent);
      secondChannel?.onmessage?.({ data: messageB } as MessageEvent);
      secondChannel?.onmessage?.({ data: messageA } as MessageEvent);
      await wait();

      if (first.getStore("shared")?.value !== second.getStore("shared")?.value) {
        mismatches += 1;
      }
    }

    first.clearAllStores();
    second.clearAllStores();
  } finally {
    MockBroadcastChannel.reset();
    globalShim.window = originalWindow;
    globalShim.BroadcastChannel = originalBroadcastChannel;
  }

  return { rounds, mismatches };
};

const main = async () => {
  installSync();
  console.log(
    JSON.stringify(
      {
        syncScale: await benchSyncScale(),
        conflictDeterminism: await benchConflictDeterminism(),
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
