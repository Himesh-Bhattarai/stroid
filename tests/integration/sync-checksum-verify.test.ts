/**
 * @module tests/integration/sync-checksum-verify.test
 *
 * LAYER: Integration
 * OWNS:  Sync checksum verification regression coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { installSync } from "../../src/sync.js";
import { createStore, deleteStore, getStore } from "../../src/store.js";
import { hashState } from "../../src/utils.js";

installSync();

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

  postMessage(data: unknown) {
    if (this.closed) throw new Error("BroadcastChannel is closed");
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

test("sync rejects incoming messages with a bad checksum", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalBroadcastChannel = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  const errors: string[] = [];

  (globalThis as { window: unknown }).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as { BroadcastChannel: unknown }).BroadcastChannel = MockBroadcastChannel;

  try {
    createStore("syncChecksumStore", { value: 1 }, {
      sync: { policy: "insecure", checksum: "hash" },
      onError: (msg) => { errors.push(msg); },
    });

    const peer = new MockBroadcastChannel("stroid_sync_syncChecksumStore");
    const data = { value: 2 };
    peer.postMessage({
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncChecksumStore",
      clock: 1,
      source: "peer-tab",
      updatedAt: Date.now() + 1,
      data,
      checksum: hashState(data) + 1,
    });

    await wait(20);

    assert.deepStrictEqual(getStore("syncChecksumStore"), { value: 1 });
    assert.ok(errors.some((msg) => msg.includes("checksum mismatch") && msg.includes("syncChecksumStore")));
  } finally {
    deleteStore("syncChecksumStore");
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = originalBroadcastChannel;
    MockBroadcastChannel.reset();
  }
});
