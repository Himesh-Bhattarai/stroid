import assert from "node:assert";
import test from "node:test";

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

test("sync broadcasts updates and rejects oversized payloads", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const { createStore, setStore, clearAllStores } = await import(`../src/store.js?sync-${Date.now()}`);
  const errors: string[] = [];

  try {
    createStore("shared", { value: "a" }, {
      sync: { maxPayloadBytes: 1024 },
      onError: (msg) => { errors.push(msg); },
    });

    setStore("shared", { value: "b" });
    await wait();

    assert.strictEqual(
      MockBroadcastChannel.sent.filter((entry) => entry.data?.name === "shared").length,
      1
    );

    MockBroadcastChannel.sent = [];

    createStore("large", { blob: "seed" }, {
      sync: { maxPayloadBytes: 120 },
      onError: (msg) => { errors.push(msg); },
    });

    setStore("large", { blob: "x".repeat(300) });
    await wait();

    assert.strictEqual(
      MockBroadcastChannel.sent.filter((entry) => entry.data?.name === "large").length,
      0
    );
    assert.ok(errors.some((msg) => msg.includes('Sync payload for "large" exceeds')));
  } finally {
    clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});
