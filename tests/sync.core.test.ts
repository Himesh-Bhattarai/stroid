import test from "node:test";
import assert from "node:assert";
import "../src/sync.js";
import { createStore, setStore } from "../src/store.js";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();

  readonly name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>();
    peers.add(this);
    MockBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: any) {
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
  }
}

test("sync reports missing BroadcastChannel in non-browser environments", () => {
  const errors: string[] = [];
  createStore("shared", { value: 1 }, {
    sync: true,
    onError: (msg) => { errors.push(msg); },
  });

  assert.ok(errors.some((msg) => msg.includes("BroadcastChannel not available")));
});

test("sync option accepts object config without throwing", () => {
  const errors: string[] = [];
  createStore("syncConfig", { value: 1 }, {
    sync: { maxPayloadBytes: 1024 },
    onError: (msg) => { errors.push(msg); },
  });

  setStore("syncConfig", { value: 2 });
  assert.strictEqual(errors.length > 0, true);
});

test("sync conflictResolver runs on older incoming versions", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const { createStore, getStore, setStore, clearAllStores } = await import(`../src/store.js?sync-conflict-${Date.now()}`);
  const calls: Array<{ local: unknown; incoming: unknown }> = [];

  try {
    createStore("shared", { value: "local" }, {
      sync: {
        conflictResolver: ({ local, incoming }) => {
          calls.push({ local, incoming });
          return { value: "resolved" };
        },
      },
    });

    setStore("shared", { value: "local2" });
    await wait();

    const peer = new MockBroadcastChannel("stroid_sync_shared");
    peer.postMessage({
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "shared",
      clock: -1,
      source: "peer",
      data: { value: "incoming" },
      updatedAt: Date.now(),
    });

    await wait();

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(getStore("shared"), { value: "resolved" });
  } finally {
    clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("sync rejects malformed messages and leaves state unchanged", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const { createStore, getStore, clearAllStores } = await import(`../src/store.js?sync-malformed-${Date.now()}`);
  const errors: string[] = [];

  try {
    createStore("shared", { value: "local" }, {
      sync: true,
      onError: (msg) => { errors.push(msg); },
    });

    const peer = new MockBroadcastChannel("stroid_sync_shared");
    peer.postMessage({
      v: 1,
      protocol: 999,
      type: "sync-state",
      name: "shared",
      clock: 1,
      source: "peer",
      data: { value: "incoming" },
      updatedAt: Date.now(),
    });

    await wait();

    assert.deepStrictEqual(getStore("shared"), { value: "local" });
    assert.ok(errors.some((msg) => msg.includes("Sync protocol mismatch")));
  } finally {
    clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});
