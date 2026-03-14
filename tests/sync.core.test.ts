import test from "node:test";
import assert from "node:assert";
import "../src/sync.js";
import { createStore, setStore, getStore, deleteStore } from "../src/store.js";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();

  readonly name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(name: string) {
    this.name = name;
    const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>();
    peers.add(this);
    MockBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: any) {
    if (this.closed) {
      throw new Error("BroadcastChannel is closed");
    }
    const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set<MockBroadcastChannel>();
    peers.forEach((peer) => {
      if (peer === this) return;
      queueMicrotask(() => {
        peer.onmessage?.({ data } as MessageEvent);
      });
    });
  }

  close() {
    this.closed = true;
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

  await t.test("sync sign rejects promise-returning signers", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const errors: string[] = [];

    try {
      createStore("syncSignPromise", { value: 1 }, {
        sync: {
          sign: () => Promise.resolve("token") as any,
        },
        onError: (msg) => { errors.push(msg); },
      });

      setStore("syncSignPromise", { value: 2 });
      await wait();

      assert.deepStrictEqual(getStore("syncSignPromise"), { value: 2 });
      assert.ok(errors.some((msg) => msg.includes("signer") && msg.includes("Promise")));
    } finally {
      deleteStore("syncSignPromise");
      (globalThis as any).window = originalWindow;
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
  });

  await t.test("sync reports failures when BroadcastChannel is closed", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const errors: string[] = [];

    try {
      createStore("syncClosed", { value: 1 }, {
        sync: true,
        onError: (msg) => { errors.push(msg); },
      });

      const channels = MockBroadcastChannel.channels.get("stroid_sync_syncClosed");
      const channel = channels?.values().next().value as MockBroadcastChannel | undefined;
      channel?.close();

      setStore("syncClosed", { value: 2 });
      await wait();

      assert.ok(errors.some((msg) => msg.includes("Failed to broadcast sync")));
    } finally {
      deleteStore("syncClosed");
      (globalThis as any).window = originalWindow;
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
  });

  await t.test("sync authToken rejects mismatched tokens and accepts matching tokens", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const errors: string[] = [];

    try {
      createStore("syncToken", { value: "local" }, {
        sync: { authToken: "secret" },
        onError: (msg) => { errors.push(msg); },
      });

      setStore("syncToken", { value: "local2" });
      await wait();

      const peer = new MockBroadcastChannel("stroid_sync_syncToken");
      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncToken",
        clock: 999,
        source: "peer",
        data: { value: "bad" },
        updatedAt: Date.now(),
        token: "wrong",
      });

      await wait();
      assert.deepStrictEqual(getStore("syncToken"), { value: "local2" });
      assert.ok(errors.some((msg) => msg.includes("auth token")));

      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncToken",
        clock: 1000,
        source: "peer",
        data: { value: "ok" },
        updatedAt: Date.now(),
        token: "secret",
      });

      await wait();
      assert.deepStrictEqual(getStore("syncToken"), { value: "ok" });
    } finally {
      deleteStore("syncToken");
      (globalThis as any).window = originalWindow;
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
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
