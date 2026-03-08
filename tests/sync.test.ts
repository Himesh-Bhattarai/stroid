import assert from "node:assert";
import test from "node:test";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const withMockedNow = async (timestamp: number, fn: () => Promise<void> | void) => {
  const RealDate = Date;
  class MockDate extends Date {
    constructor(value?: string | number | Date) {
      super(value ?? timestamp);
    }

    static now() {
      return timestamp;
    }

    static parse = RealDate.parse;
    static UTC = RealDate.UTC;
  }

  // @ts-ignore
  globalThis.Date = MockDate;
  try {
    await fn();
  } finally {
    // @ts-ignore
    globalThis.Date = RealDate;
  }
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
      MockBroadcastChannel.sent.filter(
        (entry) => entry.data?.name === "shared" && entry.data?.type === "sync-state"
      ).length,
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
      MockBroadcastChannel.sent.filter(
        (entry) => entry.data?.name === "large" && entry.data?.type === "sync-state"
      ).length,
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

test("sync ordering prefers monotonic clocks over wall-clock skew", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const a = await import(`../src/store.js?sync-a-${Date.now()}`);
  const b = await import(`../src/store.js?sync-b-${Date.now()}`);

  try {
    a.createStore("shared", { value: "seed" }, { sync: true });
    b.createStore("shared", { value: "seed" }, { sync: true });
    await wait();

    await withMockedNow(200_000, async () => {
      a.setStore("shared", { value: "future-a" });
      await wait();
    });

    assert.deepStrictEqual(b.getStore("shared"), { value: "future-a" });

    await withMockedNow(1_000, async () => {
      b.setStore("shared", { value: "newer-b" });
      await wait();
    });

    await wait();

    assert.deepStrictEqual(a.getStore("shared"), { value: "newer-b" });
    assert.deepStrictEqual(b.getStore("shared"), { value: "newer-b" });
  } finally {
    a.clearAllStores();
    b.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("sync requests the latest snapshot when a tab reconnects", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const a = await import(`../src/store.js?sync-reopen-a-${Date.now()}`);
  const b = await import(`../src/store.js?sync-reopen-b-${Date.now()}`);

  try {
    a.createStore("shared", { value: "seed" }, { sync: true });
    a.setStore("shared", { value: "latest" });
    await wait();

    b.createStore("shared", { value: "stale" }, { sync: true });
    await wait();
    await wait();

    assert.deepStrictEqual(b.getStore("shared"), { value: "latest" });
  } finally {
    a.clearAllStores();
    b.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("sync broadcasts canonical state even when a redactor is configured", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const a = await import(`../src/store.js?sync-redactor-a-${Date.now()}`);
  const b = await import(`../src/store.js?sync-redactor-b-${Date.now()}`);

  try {
    a.createStore("shared", { visible: "seed", secret: "keep" }, {
      sync: true,
      redactor: (state: any) => ({ visible: state.visible }),
    });
    b.createStore("shared", { visible: "seed", secret: "keep" }, { sync: true });
    await wait();

    a.setStore("shared", { visible: "next", secret: "top-secret" });
    await wait();
    await wait();

    assert.deepStrictEqual(b.getStore("shared"), {
      visible: "next",
      secret: "top-secret",
    });
  } finally {
    a.clearAllStores();
    b.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("late sync messages after delete are ignored safely", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../src/store.js?sync-late-delete-${Date.now()}`);

  try {
    store.createStore("shared", { value: "seed" }, { sync: true });
    const channel = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? [])[0];
    assert.ok(channel);

    store.deleteStore("shared");

    assert.doesNotThrow(() => {
      channel.onmessage?.({
        data: {
          type: "sync-state",
          source: "remote-tab",
          name: "shared",
          clock: 99,
          updatedAt: Date.now(),
          data: { value: "late" },
        },
      } as MessageEvent);
    });
    assert.strictEqual(store.hasStore("shared"), false);
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});
