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
import { normalizeStoreOptions, type SyncOptions } from "../../../src/adapters/options.js";
import { deepClone, hashState } from "../../../src/utils.js";

test("sync runtime reports sanitize errors and setup failures", () => {
  const globalWithBroadcastChannel = globalThis as typeof globalThis & { BroadcastChannel?: typeof BroadcastChannel };
  const originalBroadcast = globalWithBroadcastChannel.BroadcastChannel;
  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    constructor(_name: string) {
      MockChannel.instances.push(this);
    }
    postMessage(_payload: unknown) {}
    close() {}
  }

  const runtime = createSyncFeatureRuntime();
  if (!runtime.onStoreCreate) throw new Error("Expected sync runtime onStoreCreate");
  type CreateCtx = Parameters<NonNullable<typeof runtime.onStoreCreate>>[0];
  const errors: string[] = [];
  const options = normalizeStoreOptions({ sync: { authToken: "token" } }, "syncSanitize");
  const now = Date.now();
  const meta: NonNullable<ReturnType<CreateCtx["getMeta"]>> = {
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    updatedAtMs: now,
    updateCount: 1,
    version: 1,
    metrics: {
      notifyCount: 0,
      totalNotifyMs: 0,
      lastNotifyMs: 0,
      resetCount: 0,
      totalResetMs: 0,
      lastResetMs: 0,
    },
    options,
    readCount: 0,
    lastReadAt: null,
    lastReadAtMs: null,
    lastCorrelationId: null,
    lastCorrelationAt: null,
    lastCorrelationAtMs: null,
    lastTraceContext: null,
  };

  const ctx: CreateCtx = {
    name: "syncSanitize",
    options,
    getMeta: () => meta,
    getStoreValue: () => ({ ok: true }),
    getAllStores: () => ({ syncSanitize: { ok: true } }),
    getInitialState: () => ({ ok: true }),
    hasStore: () => true,
    notify: () => undefined,
    validate: (next) => ({ ok: true, value: next }),
    reportStoreError: (message: string) => errors.push(message),
    warn: () => undefined,
    warnAlways: () => undefined,
    log: () => undefined,
    setStoreValue: () => undefined,
    isDev: () => true,
    sanitize: (value: unknown) => {
      if (typeof value === "bigint") throw new Error("sanitize boom");
      return value;
    },
    hashState,
    deepClone,
    applyFeatureState: (value) => value,
  };

  globalWithBroadcastChannel.BroadcastChannel = MockChannel as unknown as typeof BroadcastChannel;
  runtime.onStoreCreate(ctx);
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
      checksum: hashState(BigInt(1)),
      updatedAt: Date.now(),
    },
  } as MessageEvent<unknown>);
  assert.ok(errors.some((message) => message.includes("Sanitize failed for incoming sync")));

  const setupErrors: string[] = [];
  globalWithBroadcastChannel.BroadcastChannel = class {
    constructor(_name: string) {
      throw new Error("boom");
    }
  } as unknown as typeof BroadcastChannel;
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

  globalWithBroadcastChannel.BroadcastChannel = originalBroadcast;
});

test("broadcastSync reports signer failures", () => {
  const errors: string[] = [];
  const syncOption = {
    sign: () => { throw new Error("sign"); },
  } satisfies SyncOptions;
  const syncChannels: Record<string, BroadcastChannel> = {
    syncSignFail: { postMessage: () => undefined } as unknown as BroadcastChannel,
  };
  const syncClocks: Record<string, number> = Object.create(null);
  broadcastSync({
    name: "syncSignFail",
    syncOption,
    syncChannels,
    syncClocks,
    instanceId: "instance",
    updatedAt: Date.now(),
    data: { ok: true },
    hashState,
    reportStoreError: (_name, message) => errors.push(message),
  });
  assert.ok(errors.some((message) => message.includes("Failed to sign sync payload")));
});

test("sync runtime handles verify errors, sync requests, and conflict resolution", () => {
  const globalWithBroadcastChannel = globalThis as typeof globalThis & { BroadcastChannel?: typeof BroadcastChannel };
  const originalBroadcast = globalWithBroadcastChannel.BroadcastChannel;
  const posts: Array<unknown> = [];
  class MockChannel {
    static instances: MockChannel[] = [];
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    constructor(_name: string) {
      MockChannel.instances.push(this);
    }
    postMessage(payload: unknown) {
      posts.push(payload);
    }
    close() {}
  }
  globalWithBroadcastChannel.BroadcastChannel = MockChannel as unknown as typeof BroadcastChannel;

  const runtime = createSyncFeatureRuntime();
  const errors: string[] = [];
  if (!runtime.onStoreCreate) throw new Error("Expected sync runtime onStoreCreate");
  type CreateCtx = Parameters<NonNullable<typeof runtime.onStoreCreate>>[0];

  const syncOption = {
    authToken: "token",
    verify: () => { throw new Error("verify boom"); },
    conflictResolver: ({ incoming }) => {
      const value = (incoming as { value?: unknown } | null)?.value;
      return { value: typeof value === "number" ? value : 0 };
    },
    resolveUpdatedAt: ({ incomingUpdated, now }) => incomingUpdated ?? now,
  } satisfies SyncOptions;

  const options = normalizeStoreOptions({ sync: syncOption }, "syncVerify");
  const now = Date.now();
  const meta: NonNullable<ReturnType<CreateCtx["getMeta"]>> = {
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    updatedAtMs: now,
    updateCount: 1,
    version: 1,
    metrics: {
      notifyCount: 0,
      totalNotifyMs: 0,
      lastNotifyMs: 0,
      resetCount: 0,
      totalResetMs: 0,
      lastResetMs: 0,
    },
    options,
    readCount: 0,
    lastReadAt: null,
    lastReadAtMs: null,
    lastCorrelationId: null,
    lastCorrelationAt: null,
    lastCorrelationAtMs: null,
    lastTraceContext: null,
  };

  const ctx: CreateCtx = {
    name: "syncVerify",
    options,
    getMeta: () => meta,
    getStoreValue: () => ({ value: 1 }),
    getAllStores: () => ({ syncVerify: { value: 1 } }),
    getInitialState: () => ({ value: 1 }),
    hasStore: () => true,
    notify: () => undefined,
    validate: (next) => ({ ok: true, value: next }),
    reportStoreError: (message: string) => errors.push(message),
    warn: () => undefined,
    warnAlways: () => undefined,
    log: () => undefined,
    setStoreValue: () => undefined,
    isDev: () => true,
    sanitize: (value: unknown) => value,
    hashState,
    deepClone,
    applyFeatureState: (value) => value,
  };

  runtime.onStoreCreate(ctx);
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
      checksum: hashState({ value: 2 }),
      updatedAt: Date.now(),
    },
  } as MessageEvent<unknown>);
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
  } as MessageEvent<unknown>);

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
      checksum: hashState({ value: 3 }),
      updatedAt: Date.now(),
    },
  } as MessageEvent<unknown>);

  globalWithBroadcastChannel.BroadcastChannel = originalBroadcast;
});
