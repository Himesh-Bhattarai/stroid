import assert from "node:assert";
import test from "node:test";
import "../src/sync.js";

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
          protocol: 1,
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

test("conflictResolver can resolve contested incoming sync state against local state", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../src/store.js?sync-conflict-${Date.now()}`);

  try {
    store.createStore("shared", { local: "seed", remote: "seed" }, {
      sync: {
        conflictResolver: ({ local, incoming }: any) => ({
          local: local.local,
          remote: incoming.remote,
        }),
      },
    });

    store.setStore("shared", { local: "local-win", remote: "seed" });
    await wait();

    const channel = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? [])[0];
    assert.ok(channel);

    channel.onmessage?.({
      data: {
        protocol: 1,
        type: "sync-state",
        source: "remote-tab",
        name: "shared",
        clock: 0,
        updatedAt: 0,
        data: { local: "seed", remote: "remote-win" },
      },
    } as MessageEvent);

    await wait();

    assert.deepStrictEqual(store.getStore("shared"), {
      local: "local-win",
      remote: "remote-win",
    });
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("conflictResolver rebroadcasts resolved state so peers converge", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const a = await import(`../src/store.js?sync-conflict-a-${Date.now()}`);
  const b = await import(`../src/store.js?sync-conflict-b-${Date.now()}`);
  const c = await import(`../src/store.js?sync-conflict-c-${Date.now()}`);

  try {
    a.createStore("shared", { local: "seed", remote: "seed", resolved: false }, {
      sync: {
        conflictResolver: ({ local, incoming }: any) => ({
          local: local.local,
          remote: incoming.remote,
          resolved: true,
        }),
      },
    });
    b.createStore("shared", { local: "seed", remote: "seed", resolved: false }, { sync: true });
    c.createStore("shared", { local: "seed", remote: "seed", resolved: false }, { sync: true });
    await wait();

    a.setStore("shared", { local: "local-win", remote: "seed", resolved: false });
    await wait();

    const channelA = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? [])[0];
    assert.ok(channelA);

    channelA.onmessage?.({
      data: {
        protocol: 1,
        type: "sync-state",
        source: "remote-tab",
        name: "shared",
        clock: 0,
        updatedAt: 0,
        data: { local: "seed", remote: "remote-win", resolved: false },
      },
    } as MessageEvent);

    await wait();
    await wait();

    assert.deepStrictEqual(a.getStore("shared"), {
      local: "local-win",
      remote: "remote-win",
      resolved: true,
    });
    assert.deepStrictEqual(b.getStore("shared"), {
      local: "local-win",
      remote: "remote-win",
      resolved: true,
    });
    assert.deepStrictEqual(c.getStore("shared"), {
      local: "local-win",
      remote: "remote-win",
      resolved: true,
    });
  } finally {
    a.clearAllStores();
    b.clearAllStores();
    c.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("sync ignores protocol-mismatched messages", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../src/store.js?sync-protocol-${Date.now()}`);
  const errors: string[] = [];

  try {
    store.createStore("shared", { value: "seed" }, {
      sync: true,
      onError: (msg: string) => { errors.push(msg); },
    });
    await wait();

    const channel = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? [])[0];
    assert.ok(channel);

    channel.onmessage?.({
      data: {
        protocol: 999,
        type: "sync-state",
        source: "remote-tab",
        name: "shared",
        clock: 1,
        updatedAt: 100,
        data: { value: "wrong-build" },
      },
    } as MessageEvent);

    await wait();

    assert.deepStrictEqual(store.getStore("shared"), { value: "seed" });
    assert.ok(errors.some((msg) => msg.includes('Sync protocol mismatch for "shared"')));
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("incoming sync state is sanitized and validated before commit", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../src/store.js?sync-sanitize-${Date.now()}`);

  try {
    store.createStore("shared", { when: "seed" }, {
      sync: true,
      validator: (next: any) => typeof next?.when === "string" && next.when.endsWith("Z"),
    });
    await wait();

    const channel = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? [])[0];
    assert.ok(channel);

    channel.onmessage?.({
      data: {
        protocol: 1,
        type: "sync-state",
        source: "remote-tab",
        name: "shared",
        clock: 1,
        updatedAt: 100,
        data: { when: new Date("2024-01-02T03:04:05.000Z") },
      },
    } as MessageEvent);

    await wait();

    assert.deepStrictEqual(store.getStore("shared"), { when: "2024-01-02T03:04:05.000Z" });
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("sync convergence is stable for equal-clock equal-timestamp writes delivered in different orders", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const first = await import(`../src/store.js?sync-order-first-${Date.now()}`);
  const second = await import(`../src/store.js?sync-order-second-${Date.now()}`);

  try {
    first.createStore("shared", { value: "seed" }, { sync: true });
    second.createStore("shared", { value: "seed" }, { sync: true });
    await wait();

    const channels = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? []);
    assert.strictEqual(channels.length, 2);

    const [firstChannel, secondChannel] = channels;
    const messageA = {
      protocol: 1,
      type: "sync-state",
      source: "writer-a",
      name: "shared",
      clock: 1,
      updatedAt: 100,
      data: { value: "A" },
    };
    const messageB = {
      protocol: 1,
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

    assert.deepStrictEqual(first.getStore("shared"), { value: "B" });
    assert.deepStrictEqual(second.getStore("shared"), { value: "B" });
  } finally {
    first.clearAllStores();
    second.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});

test("repeated sync create delete cycles clean up channels and ignore stale handlers", async () => {
  const originalWindow = (globalThis as any).window;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const store = await import(`../src/store.js?sync-recreate-${Date.now()}`);

  try {
    for (let i = 0; i < 5; i++) {
      store.createStore("shared", { cycle: i }, { sync: true });
      await wait();

      const channel = Array.from(MockBroadcastChannel.channels.get("stroid_sync_shared") ?? [])[0];
      assert.ok(channel);

      store.deleteStore("shared");
      assert.strictEqual(store.hasStore("shared"), false);
      assert.strictEqual(MockBroadcastChannel.channels.get("stroid_sync_shared")?.size ?? 0, 0);

      assert.doesNotThrow(() => {
        channel.onmessage?.({
          data: {
            protocol: 1,
            type: "sync-state",
            source: `remote-${i}`,
            name: "shared",
            clock: 1,
            updatedAt: Date.now(),
            data: { cycle: 999 },
          },
        } as MessageEvent);
      });
    }
  } finally {
    store.clearAllStores();
    MockBroadcastChannel.reset();
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  }
});
