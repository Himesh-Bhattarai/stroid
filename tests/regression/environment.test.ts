/**
 * @module tests/regression/environment
 *
 * LAYER: Regression
 * OWNS:  Environment edge cases and isolation checks.
 *
 * Consumers: Test runner.
 */
import assert from "node:assert";
import test from "node:test";
import "../../src/sync.js";

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

test("heavy worker-like environment without window reports sync unavailable", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  delete (globalThis as any).window;
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../../src/store.js?worker-heavy-${Date.now()}`);
  const errors: string[] = [];

  try {
    store.createStore("workerShared", { value: 1 }, {
      sync: true,
      onError: (message: string) => {
        errors.push(message);
      },
    });

    assert.ok(errors.some((message) => message.includes('BroadcastChannel not available')));
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("heavy repeated sync create delete cycles leave no open channels", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../../src/store.js?sync-heavy-${Date.now()}`);

  try {
    for (let i = 0; i < 25; i++) {
      store.createStore("shared", { cycle: i }, { sync: true });
      await wait();

      assert.strictEqual(MockBroadcastChannel.channels.get("stroid_sync_shared")?.size ?? 0, 1);

      store.deleteStore("shared");
      assert.strictEqual(MockBroadcastChannel.channels.get("stroid_sync_shared")?.size ?? 0, 0);
    }
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});


