/**
 * @module tests/performance/sync-lite
 *
 * LAYER: Performance
 * OWNS:  Lean sync broadcast timing coverage for the performance suite.
 *
 * Consumers: Test runner (performance suite).
 */
import test from "node:test";
import assert from "node:assert";
import { installSync } from "../../src/sync.js";

installSync();

const now = (): number =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

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

const withMockSyncEnvironment = async <T>(fn: () => Promise<T>): Promise<T> => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  try {
    return await fn();
  } finally {
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
};

const importStore = async (label: string) =>
  import(`../../src/store.js?sync-lite-${label}-${Date.now()}`);

test("sync emits a broadcast for a local write under threshold", { timeout: 30000 }, async () => {
  await withMockSyncEnvironment(async () => {
    const store = await importStore("single");

    try {
      store.createStore("shared", { value: "seed" }, { sync: { policy: "insecure" } });
      await wait();
      MockBroadcastChannel.sent = [];

      const start = now();
      store.setStore("shared", { value: "updated" });

      for (let attempt = 0; attempt < 50 && MockBroadcastChannel.sent.length === 0; attempt += 1) {
        await wait();
      }

      const elapsed = now() - start;
      const syncMessages = MockBroadcastChannel.sent.filter((entry) => entry.data?.type === "sync-state");

      assert.strictEqual(syncMessages.length, 1, `expected one sync-state message, got ${syncMessages.length}`);
      assert.ok(
        elapsed < 1000,
        `expected single-store sync broadcast < 1000ms, got ${elapsed.toFixed(2)}ms`,
      );
    } finally {
      store.clearAllStores();
    }
  });
});

test("sync dashboard batch emits ten broadcasts under threshold", { timeout: 30000 }, async () => {
  await withMockSyncEnvironment(async () => {
    const store = await importStore("batch");
    const storeNames = Array.from({ length: 10 }, (_, index) => `shared-${index}`);

    try {
      storeNames.forEach((name) => {
        store.createStore(name, { value: "seed" }, { sync: { policy: "insecure" } });
      });
      await wait();
      MockBroadcastChannel.sent = [];

      const start = now();
      store.setStoreBatch(() => {
        storeNames.forEach((name, index) => {
          store.setStore(name, { value: `wave-${index}` });
        });
      });

      for (let attempt = 0; attempt < 100; attempt += 1) {
        await wait();
        const syncMessages = MockBroadcastChannel.sent.filter((entry) => entry.data?.type === "sync-state");
        if (syncMessages.length >= storeNames.length) break;
      }

      const elapsed = now() - start;
      const syncMessages = MockBroadcastChannel.sent.filter((entry) => entry.data?.type === "sync-state");

      assert.strictEqual(
        syncMessages.length,
        storeNames.length,
        `expected ${storeNames.length} sync-state messages, got ${syncMessages.length}`,
      );
      assert.ok(
        elapsed < 2000,
        `expected ten-store sync dashboard batch < 2000ms, got ${elapsed.toFixed(2)}ms`,
      );
    } finally {
      store.clearAllStores();
    }
  });
});
