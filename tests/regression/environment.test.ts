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
import { installSync } from "../../src/sync.js";

installSync();

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

type GlobalTestEnv = typeof globalThis & {
  window?: unknown;
  BroadcastChannel?: unknown;
};

const g = globalThis as GlobalTestEnv;

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();

  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>();
    peers.add(this);
    MockBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: unknown) {
    const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set<MockBroadcastChannel>();
    peers.forEach((peer) => {
      if (peer === this) return;
      queueMicrotask(() => {
        peer.onmessage?.({ data } as unknown as MessageEvent<unknown>);
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
  const originalWindow = g.window;
  const originalBroadcastChannel = g.BroadcastChannel;

  delete (globalThis as unknown as Record<string, unknown>).window;
  g.BroadcastChannel = MockBroadcastChannel;

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
      delete (globalThis as unknown as Record<string, unknown>).window;
    } else {
      g.window = originalWindow;
    }
    g.BroadcastChannel = originalBroadcastChannel;
  }
});

test("heavy repeated sync create delete cycles leave no open channels", async () => {
  const originalWindow = g.window;
  const originalBroadcastChannel = g.BroadcastChannel;

  g.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  g.BroadcastChannel = MockBroadcastChannel;

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
    if (originalWindow === undefined) {
      delete (globalThis as unknown as Record<string, unknown>).window;
    } else {
      g.window = originalWindow;
    }
    g.BroadcastChannel = originalBroadcastChannel;
  }
});

