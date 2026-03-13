import test from "node:test";
import assert from "node:assert";
import "../src/sync.js";
import { createStore, setStore, getStore, deleteStore } from "../src/store.js";

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

test("sync core (serial)", async (t) => {
  await t.test("sync reports missing BroadcastChannel in non-browser environments", () => {
    const errors: string[] = [];
    createStore("syncMissingBC", { value: 1 }, {
      sync: true,
      onError: (msg) => { errors.push(msg); },
    });

    assert.ok(errors.some((msg) => msg.includes("BroadcastChannel not available")));
    deleteStore("syncMissingBC");
  });

  await t.test("sync option accepts object config without throwing", () => {
    const errors: string[] = [];
    createStore("syncConfig", { value: 1 }, {
      sync: { maxPayloadBytes: 1024 },
      onError: (msg) => { errors.push(msg); },
    });

    setStore("syncConfig", { value: 2 });
    assert.strictEqual(errors.length > 0, true);
    deleteStore("syncConfig");
  });

  await t.test("sync conflictResolver runs on older incoming versions", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const calls: Array<{ local: unknown; incoming: unknown }> = [];

  try {
    createStore("syncConflict", { value: "local" }, {
      sync: {
        conflictResolver: ({ local, incoming }) => {
          calls.push({ local, incoming });
          return { value: "resolved" };
        },
      },
    });

    setStore("syncConflict", { value: "local2" });
    await wait();

    const peer = new MockBroadcastChannel("stroid_sync_syncConflict");
    peer.postMessage({
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncConflict",
      clock: -1,
      source: "peer",
      data: { value: "incoming" },
      updatedAt: Date.now(),
    });

    await wait();

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(getStore("syncConflict"), { value: "resolved" });
  } finally {
    deleteStore("syncConflict");
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
    MockBroadcastChannel.reset();
  }
  });

  await t.test("sync rejects protocol mismatches and leaves state unchanged", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const errors: string[] = [];

  try {
    createStore("syncProtocolMismatch", { value: "local" }, {
      sync: true,
      onError: (msg) => { errors.push(msg); },
    });

    const peer = new MockBroadcastChannel("stroid_sync_syncProtocolMismatch");
    peer.postMessage({
      v: 999,
      protocol: 999,
      type: "sync-state",
      name: "syncProtocolMismatch",
      clock: 1,
      source: "peer",
      data: { value: "incoming" },
      updatedAt: Date.now(),
    });

    await wait();

    assert.deepStrictEqual(getStore("syncProtocolMismatch"), { value: "local" });
    assert.ok(errors.some((msg) => msg.includes("Sync protocol mismatch")));
  } finally {
    deleteStore("syncProtocolMismatch");
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
    MockBroadcastChannel.reset();
  }
  });
});
