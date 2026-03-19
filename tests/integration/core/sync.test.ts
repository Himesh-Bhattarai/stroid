/**
 * @module tests/integration/core/sync
 *
 * LAYER: Integration
 * OWNS:  Sync feature behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { createSyncFeatureRuntime, setupSync, broadcastSync } from "../../../src/features/sync.js";
import { deepClone } from "../../../src/utils.js";

test("sync runtime reports sanitize errors and setup failures", () => {
  const originalBroadcast = (globalThis as any).BroadcastChannel;
  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() {
      MockChannel.instances.push(this);
    }
    postMessage() {}
    close() {}
  }
  (globalThis as any).BroadcastChannel = MockChannel as unknown as typeof BroadcastChannel;

  const runtime = createSyncFeatureRuntime();
  const errors: string[] = [];
  const ctx = {
    name: "syncSanitize",
    options: { sync: { authToken: "token" } },
    getMeta: () => ({ updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), updateCount: 1, options: { sync: { authToken: "token" } } }),
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    notify: () => undefined,
    validate: (_next: any) => ({ ok: true, value: _next }),
    reportStoreError: (message: string) => errors.push(message),
    warn: () => undefined,
    setStoreValue: () => undefined,
    isDev: () => true,
    sanitize: (value: unknown) => {
      if (typeof value === "bigint") throw new Error("sanitize boom");
      return value;
    },
    hashState: () => 1,
    deepClone,
    applyFeatureState: () => undefined,
  };
  runtime.onStoreCreate(ctx as any);
  const channel = MockChannel.instances[0];
  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncSanitize",
      clock: 1,
      source: "remote",
      token: "token",
      data: BigInt(1),
      updatedAt: Date.now(),
    },
  } as MessageEvent);
  assert.ok(errors.some((message) => message.includes("Sanitize failed for incoming sync")));

  const setupErrors: string[] = [];
  (globalThis as any).BroadcastChannel = class {
    constructor() {
      throw new Error("boom");
    }
  };
  setupSync({
    name: "syncFail",
    syncOption: true,
    syncChannels: Object.create(null),
    syncClocks: Object.create(null),
    syncVersions: Object.create(null),
    syncWindowCleanup: Object.create(null),
    instanceId: "instance",
    getMeta: () => ({ updatedAt: new Date().toISOString(), updateCount: 1, options: { sync: true } }),
    getAcceptedSyncVersion: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStoreEntry: () => true,
    notify: () => undefined,
    validate: (_name, next) => ({ ok: true, value: next }),
    reportStoreError: (_name, message) => setupErrors.push(message),
    warn: (message) => setupErrors.push(message),
    setStoreValue: () => undefined,
    normalizeIncomingState: () => ({ ok: true }),
    acceptIncomingSyncVersion: () => undefined,
    resolveSyncVersion: () => 0,
    broadcastSync: () => undefined,
  });
  assert.ok(setupErrors.some((message) => message.includes("Failed to setup sync")));

  (globalThis as any).BroadcastChannel = originalBroadcast;
});

test("broadcastSync reports signer failures", () => {
  const errors: string[] = [];
  broadcastSync({
    name: "syncSignFail",
    syncOption: { sign: () => { throw new Error("sign"); } },
    syncChannels: { syncSignFail: { postMessage: () => undefined } as any },
    syncClocks: Object.create(null),
    instanceId: "instance",
    updatedAt: Date.now(),
    data: { ok: true },
    hashState: () => 1,
    reportStoreError: (_name, message) => errors.push(message),
  });
  assert.ok(errors.some((message) => message.includes("Failed to sign sync payload")));
});

test("sync runtime handles verify errors, sync requests, and conflict resolution", () => {
  const originalBroadcast = (globalThis as any).BroadcastChannel;
  const posts: Array<unknown> = [];
  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor() {
      MockChannel.instances.push(this);
    }
    postMessage(payload: unknown) {
      posts.push(payload);
    }
    close() {}
  }
  (globalThis as any).BroadcastChannel = MockChannel as unknown as typeof BroadcastChannel;

  const runtime = createSyncFeatureRuntime();
  const errors: string[] = [];
  const syncOption: any = {
    authToken: "token",
    verify: () => { throw new Error("verify boom"); },
    conflictResolver: ({ incoming }: { incoming: any }) => ({ value: incoming?.value ?? 0 }),
    resolveUpdatedAt: ({ incomingUpdated }: { incomingUpdated: number }) => incomingUpdated,
  };
  const ctx = {
    name: "syncVerify",
    options: { sync: syncOption },
    getMeta: () => ({ updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), updateCount: 1, options: { sync: syncOption } }),
    getStoreValue: () => ({ value: 1 }),
    hasStore: () => true,
    notify: () => undefined,
    validate: (_next: any) => ({ ok: true, value: _next }),
    reportStoreError: (message: string) => errors.push(message),
    warn: () => undefined,
    setStoreValue: () => undefined,
    isDev: () => true,
    sanitize: (value: unknown) => value,
    hashState: () => 1,
    deepClone,
    applyFeatureState: () => undefined,
  };

  runtime.onStoreCreate(ctx as any);
  const channel = MockChannel.instances[0];

  window.dispatchEvent(new Event("focus"));
  assert.ok(posts.length > 0);

  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncVerify",
      clock: 1,
      source: "remote",
      token: "token",
      data: { value: 2 },
      updatedAt: Date.now(),
    },
  } as MessageEvent);
  assert.ok(errors.some((message) => message.includes("verification failed")));

  syncOption.verify = () => true;
  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-request",
      name: "syncVerify",
      clock: 0,
      source: "remote",
      token: "token",
    },
  } as MessageEvent);

  channel.onmessage?.({
    data: {
      v: 1,
      protocol: 1,
      type: "sync-state",
      name: "syncVerify",
      clock: 0,
      source: "",
      token: "token",
      data: { value: 3 },
      updatedAt: Date.now(),
    },
  } as MessageEvent);

  (globalThis as any).BroadcastChannel = originalBroadcast;
});
