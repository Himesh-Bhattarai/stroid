/**
 * @module tests/sync.core.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/sync.core.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { installSync } from "../../src/sync.js";
import { installPersist } from "../../src/persist.js";
import { configureStroid, resetConfig } from "../../src/config.js";
import { createStore, setStore, getStore, deleteStore } from "../../src/store.js";
import { hashState } from "../../src/utils.js";

installSync();
installPersist();

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

class DataCloneBroadcastChannel extends MockBroadcastChannel {
  postMessage(_data: any) {
    const err = new Error("DataCloneError");
    (err as any).name = "DataCloneError";
    throw err;
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

  await t.test("sync warns when unauthenticated", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const warnings: string[] = [];
    configureStroid({
      logSink: {
        warn: (msg: string) => { warnings.push(msg); },
      },
    });

    try {
      createStore("syncInsecure", { value: 1 }, {
        sync: true,
      });

      setStore("syncInsecure", { value: 2 });
      await wait();

      assert.ok(warnings.some((msg) => msg.includes("unauthenticated") && msg.includes("syncInsecure")));
    } finally {
      deleteStore("syncInsecure");
      resetConfig();
      (globalThis as any).window = originalWindow;
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
  });

  await t.test("sync strict policy blocks unauthenticated sync", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const errors: string[] = [];

    try {
      createStore("syncStrict", { value: 1 }, {
        sync: { policy: "strict" },
        onError: (msg) => { errors.push(msg); },
      });

      setStore("syncStrict", { value: 2 });
      await wait();

      assert.ok(errors.some((msg) => msg.includes("strict mode") && msg.includes("authToken")));
      const channels = MockBroadcastChannel.channels.get("stroid_sync_syncStrict");
      assert.strictEqual(!!(channels && channels.size > 0), false);
    } finally {
      deleteStore("syncStrict");
      (globalThis as any).window = originalWindow;
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
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

  await t.test("sync-applied remote state triggers persist writes", async () => {
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    let stored: string | null = null;
    let setCalls = 0;
    const driver = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        setCalls += 1;
        stored = value;
      },
      removeItem: () => {
        stored = null;
      },
    };

    try {
      createStore("syncPersisted", { value: 1 }, {
        sync: { policy: "insecure" },
        persist: {
          driver,
          key: "sync-persisted",
          serialize: JSON.stringify,
          deserialize: JSON.parse,
          encrypt: (v: string) => v,
          decrypt: (v: string) => v,
          checksum: "none",
          allowPlaintext: true,
        },
      });

      await wait(20);
      setCalls = 0;
      stored = null;

      const peer = new MockBroadcastChannel("stroid_sync_syncPersisted");
      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncPersisted",
        clock: 1,
        source: "peer-tab",
        updatedAt: Date.now() + 1,
        data: { value: 2 },
        checksum: hashState({ value: 2 }),
      });

      await wait(20);

      assert.deepStrictEqual(getStore("syncPersisted"), { value: 2 });
      assert.strictEqual(setCalls >= 1, true);
      assert.strictEqual(stored !== null, true);
    } finally {
      deleteStore("syncPersisted");
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
  });

  await t.test("sync conflict-resolver writes also trigger persist hooks", async () => {
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    let stored: string | null = null;
    let setCalls = 0;
    const driver = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        setCalls += 1;
        stored = value;
      },
      removeItem: () => {
        stored = null;
      },
    };

    try {
      createStore("syncConflictPersist", { value: 1 }, {
        sync: {
          policy: "insecure",
          conflictResolver: ({ local, incoming }) => ({
            value: Math.max((local as any)?.value ?? 0, (incoming as any)?.value ?? 0) + 1,
          }),
        },
        persist: {
          driver,
          key: "sync-conflict-persist",
          serialize: JSON.stringify,
          deserialize: JSON.parse,
          encrypt: (v: string) => v,
          decrypt: (v: string) => v,
          checksum: "none",
          allowPlaintext: true,
        },
      });

      setStore("syncConflictPersist", { value: 5 });
      await wait(20);
      setCalls = 0;
      stored = null;

      const peer = new MockBroadcastChannel("stroid_sync_syncConflictPersist");
      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncConflictPersist",
        clock: 0,
        source: "peer-tab",
        updatedAt: Date.now(),
        data: { value: 3 },
        checksum: hashState({ value: 3 }),
      });

      await wait(20);

      assert.deepStrictEqual(getStore("syncConflictPersist"), { value: 6 });
      assert.strictEqual(setCalls >= 1, true);
      assert.strictEqual(stored !== null, true);
    } finally {
      deleteStore("syncConflictPersist");
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
  });

  await t.test("sync reports DataCloneError with store context", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = DataCloneBroadcastChannel;

    const errors: string[] = [];

    try {
      createStore("syncClone", { value: 1 }, {
        sync: true,
        onError: (msg) => { errors.push(msg); },
      });

      setStore("syncClone", { value: 2 });
      await wait();

      assert.ok(errors.some((msg) => msg.includes("DataCloneError") && msg.includes("syncClone")));
    } finally {
      deleteStore("syncClone");
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
        checksum: hashState({ value: "bad" }),
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
        checksum: hashState({ value: "ok" }),
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

  await t.test("sync verify rejects spoofed messages even with a valid token", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const errors: string[] = [];

    try {
      createStore("syncVerify", { value: "local" }, {
        sync: {
          authToken: "secret",
          verify: (msg) => msg.auth === "sig",
        },
        onError: (msg) => { errors.push(msg); },
      });

      setStore("syncVerify", { value: "local2" });
      await wait();

      const peer = new MockBroadcastChannel("stroid_sync_syncVerify");
      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncVerify",
        clock: 5,
        source: "peer",
        data: { value: "spoof" },
        updatedAt: Date.now(),
        token: "secret",
        auth: "bad",
        checksum: hashState({ value: "spoof" }),
      });

      await wait();
      assert.deepStrictEqual(getStore("syncVerify"), { value: "local2" });
      assert.ok(errors.some((msg) => msg.includes("failed verification")));

      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncVerify",
        clock: 6,
        source: "peer",
        data: { value: "ok" },
        updatedAt: Date.now(),
        token: "secret",
        auth: "sig",
        checksum: hashState({ value: "ok" }),
      });

      await wait();
      assert.deepStrictEqual(getStore("syncVerify"), { value: "ok" });
    } finally {
      deleteStore("syncVerify");
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
      checksum: hashState({ value: "incoming" }),
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

  await t.test("sync loopGuard suppresses immediate rebroadcasts", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const received: any[] = [];

    try {
      createStore("syncLoop", { value: 0 }, {
        sync: { loopGuard: { windowMs: 50 } },
      });

      const peer = new MockBroadcastChannel("stroid_sync_syncLoop");
      peer.onmessage = (event: MessageEvent) => {
        if (event.data?.type !== "sync-state") return;
        received.push(event.data);
      };

      peer.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncLoop",
        clock: 1,
        source: "peer",
        data: { value: 1 },
        updatedAt: Date.now(),
        checksum: hashState({ value: 1 }),
      });

      await wait();

      setStore("syncLoop", { value: 2 });
      await wait();

      assert.strictEqual(received.length, 0);

      await wait(60);
      setStore("syncLoop", { value: 3 });
      await wait();

      assert.ok(received.length >= 1);
    } finally {
      deleteStore("syncLoop");
      (globalThis as any).window = originalWindow;
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
      MockBroadcastChannel.reset();
    }
  });

  await t.test("sync loopGuard defaults on and can be disabled", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const receivedDefault: any[] = [];
    const receivedDisabled: any[] = [];

    try {
      createStore("syncLoopDefault", { value: 0 }, { sync: true });
      const peerDefault = new MockBroadcastChannel("stroid_sync_syncLoopDefault");
      peerDefault.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "sync-state") receivedDefault.push(event.data);
      };

      peerDefault.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncLoopDefault",
        clock: 1,
        source: "peer",
        data: { value: 1 },
        updatedAt: Date.now(),
        checksum: hashState({ value: 1 }),
      });

      await wait();
      setStore("syncLoopDefault", { value: 2 });
      await wait();

      assert.strictEqual(receivedDefault.length, 0);

      createStore("syncLoopDisabled", { value: 0 }, { sync: { loopGuard: false } });
      const peerDisabled = new MockBroadcastChannel("stroid_sync_syncLoopDisabled");
      peerDisabled.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "sync-state") receivedDisabled.push(event.data);
      };

      peerDisabled.postMessage({
        v: 1,
        protocol: 1,
        type: "sync-state",
        name: "syncLoopDisabled",
        clock: 1,
        source: "peer",
        data: { value: 1 },
        updatedAt: Date.now(),
        checksum: hashState({ value: 1 }),
      });

      await wait();
      setStore("syncLoopDisabled", { value: 2 });
      await wait();

      assert.ok(receivedDisabled.length >= 1);
    } finally {
      deleteStore("syncLoopDefault");
      deleteStore("syncLoopDisabled");
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
      checksum: hashState({ value: "incoming" }),
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


