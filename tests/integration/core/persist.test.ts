/**
 * @module tests/integration/core/persist
 *
 * LAYER: Integration
 * OWNS:  Persist feature behavior and options.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { deepClone, sanitize } from "../../../src/utils.js";
import { persistSave, flushPersistImmediately } from "../../../src/features/persist/save.js";
import { persistLoad } from "../../../src/features/persist/load.js";
import { setupPersistWatch, setPersistPresence } from "../../../src/features/persist/watch.js";
import { normalizePersistOptions } from "../../../src/adapters/options.js";
import { validateCryptoPair } from "../../../src/features/persist/crypto.js";
import { createPersistFeatureRuntime } from "../../../src/features/persist.js";
import { computePersistChecksum } from "../../../src/features/persist/checksum.js";
import type { NormalizedOptions, PersistConfig, StoreValue } from "../../../src/adapters/options.js";
import type { PersistSaveArgs, PersistWatchState } from "../../../src/features/persist/types.js";
import type { FeatureHookContext, StoreFeatureMeta } from "../../../src/features/feature-registry.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const makePersistConfig = (
  overrides: Pick<PersistConfig, "key" | "driver"> & Partial<PersistConfig> & {
    migrate?: (state: StoreValue) => StoreValue;
  },
): PersistConfig & { migrate?: (state: StoreValue) => StoreValue } => ({
  key: overrides.key,
  driver: overrides.driver,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  allowPlaintext: true,
  checksum: "none",
  ...overrides,
});

const makeNormalizedOptions = (persist: PersistConfig | null): NormalizedOptions => ({
  scope: "request",
  lazy: false,
  pathCreate: false,
  persist,
  devtools: false,
  middleware: [],
  migrations: {},
  version: 1,
  historyLimit: 50,
  snapshot: "deep",
  explicitPersist: true,
  explicitSync: false,
  explicitDevtools: false,
});

const makeMeta = (options: NormalizedOptions, overrides?: Partial<StoreFeatureMeta>): StoreFeatureMeta => ({
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updatedAtMs: Date.now(),
  updateCount: 0,
  version: options.version,
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
  ...overrides,
});

const makeHookContext = ({
  name,
  options,
  getMeta,
  initialState,
  storeValue,
  hasStore = () => true,
  reportStoreError = () => undefined,
  warn = () => undefined,
  warnAlways = () => undefined,
  log = () => undefined,
  isDev = () => true,
}: {
  name: string;
  options: NormalizedOptions;
  getMeta: () => StoreFeatureMeta | undefined;
  initialState: StoreValue;
  storeValue: StoreValue;
  hasStore?: () => boolean;
  reportStoreError?: (message: string) => void;
  warn?: (message: string) => void;
  warnAlways?: (message: string) => void;
  log?: (message: string) => void;
  isDev?: () => boolean;
}): FeatureHookContext => {
  let current = storeValue;
  return {
    name,
    options,
    getMeta,
    getStoreValue: () => current,
    getAllStores: () => ({ [name]: current }),
    getInitialState: () => initialState,
    hasStore,
    setStoreValue: (value) => { current = value; },
    applyFeatureState: (value) => {
      current = value;
      return value;
    },
    notify: () => undefined,
    reportStoreError,
    warn,
    warnAlways,
    log,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: (next) => ({ ok: true, value: next }),
    isDev,
  };
};

test("flushPersistImmediately clears pending timers", async () => {
  const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const persistInFlight: Record<string, Promise<void> | null> = {};
  const persistSequence: Record<string, number> = {};
  const persistWatchState: PersistWatchState = {};
  const plaintextWarningsIssued = new Set<string>();
  let calls = 0;

  const persistConfig = makePersistConfig({
    key: "persist-key",
    driver: {
      setItem: async () => { calls += 1; },
    },
    checksum: "none",
    allowPlaintext: true,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);

  const args: PersistSaveArgs = {
    name: "persist-store",
    persistTimers,
    persistInFlight,
    persistSequence,
    persistWatchState,
    plaintextWarningsIssued,
    exists: () => true,
    getMeta: () => meta,
    getStoreValue: () => ({ value: 1 }),
    reportStoreError: () => undefined,
    hashState: () => 1,
  };

  persistSave(args);
  assert.ok(persistTimers["persist-store"]);
  flushPersistImmediately("persist-store", args);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(!persistTimers["persist-store"]);
  assert.ok(calls >= 1);
});

test("flushPersistImmediately ignores a stale queued timer callback", async () => {
  const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const persistInFlight: Record<string, Promise<void> | null> = {};
  const persistSequence: Record<string, number> = {};
  const persistWatchState: PersistWatchState = {};
  const plaintextWarningsIssued = new Set<string>();
  const writes: number[] = [];
  const scheduled: Array<{ handle: ReturnType<typeof setTimeout>; fn: () => void }> = [];

  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  const persistConfig = makePersistConfig({
    key: "persist-stale-timer",
    driver: {
      setItem: async () => { writes.push(Date.now()); },
    },
    checksum: "none",
    allowPlaintext: true,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);

  const args: PersistSaveArgs = {
    name: "persist-stale-timer",
    persistTimers,
    persistInFlight,
    persistSequence,
    persistWatchState,
    plaintextWarningsIssued,
    exists: () => true,
    getMeta: () => meta,
    getStoreValue: () => ({ value: 1 }),
    reportStoreError: () => undefined,
    hashState: () => 1,
  };

  try {
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>): ReturnType<typeof setTimeout> => {
      const [handler] = args;
      if (typeof handler !== "function") {
        throw new TypeError("mock setTimeout only supports function handlers");
      }
      const cb = handler as (...handlerArgs: unknown[]) => void;
      const handle = { id: scheduled.length } as unknown as ReturnType<typeof setTimeout>;
      scheduled.push({ handle, fn: () => cb() });
      return handle;
    }) satisfies typeof setTimeout;

    globalThis.clearTimeout = ((..._args: Parameters<typeof clearTimeout>): void => undefined) satisfies typeof clearTimeout;

    persistSave(args);
    assert.strictEqual(scheduled.length, 1);

    flushPersistImmediately("persist-stale-timer", args);
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(writes.length, 1);

    scheduled[0].fn();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(writes.length, 1);
    assert.ok(!persistTimers["persist-stale-timer"]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("flushPersistImmediately can be superseded while waiting behind an in-flight write", async () => {
  const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const persistInFlight: Record<string, Promise<void> | null> = {};
  const persistSequence: Record<string, number> = {};
  const persistWatchState: PersistWatchState = {};
  const plaintextWarningsIssued = new Set<string>();
  const writes: string[] = [];
  let currentValue = { value: 1 };
  let releaseFirstWrite: (() => void) | null = null;

  const persistConfig = makePersistConfig({
    key: "persist-ordering",
    driver: {
      setItem: async (_key: string, payload: string) => {
        writes.push(payload);
        if (releaseFirstWrite) return;
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      },
    },
    checksum: "none",
    allowPlaintext: true,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);

  const args: PersistSaveArgs = {
    name: "persist-ordering",
    persistTimers,
    persistInFlight,
    persistSequence,
    persistWatchState,
    plaintextWarningsIssued,
    exists: () => true,
    getMeta: () => meta,
    getStoreValue: () => currentValue,
    reportStoreError: () => undefined,
    hashState: () => 1,
  };

  persistSave(args);

  const startedAt = Date.now();
  while (!releaseFirstWrite) {
    if (Date.now() - startedAt > 200) {
      throw new Error("initial persist write did not start in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  currentValue = { value: 2 };
  flushPersistImmediately("persist-ordering", args);

  currentValue = { value: 3 };
  flushPersistImmediately("persist-ordering", args);

  releaseFirstWrite();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.strictEqual(writes.length, 2);
  const firstEnvelope = JSON.parse(writes[0]);
  const lastEnvelope = JSON.parse(writes[1]);
  assert.strictEqual(firstEnvelope.data, JSON.stringify({ value: 1 }));
  assert.strictEqual(lastEnvelope.data, JSON.stringify({ value: 3 }));
});

test("normalizePersistOptions rejects invalid async crypto and plaintext sensitive stores", () => {
  assert.throws(
    () => normalizePersistOptions({ encryptAsync: async (v: string) => v }, "badAsync"),
    /encryptAsync/
  );
  assert.throws(
    () => normalizePersistOptions({ sensitiveData: true, encrypt: (v: string) => v, decrypt: (v: string) => v }, "badSensitive"),
    /sensitiveData/
  );
});

test("persistLoad reports non-string sync driver values", () => {
  const errors: string[] = [];
  const persistConfig: PersistConfig = makePersistConfig({
    key: "persist-nonstring",
    driver: {
      // @ts-expect-error - test intentionally returns a non-string value at runtime.
      getItem: () => ({ bad: true }),
    },
    checksum: "none",
    allowPlaintext: true,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);
  const loaded = persistLoad({
    name: "persistNonString",
    silent: true,
    getMeta: () => meta,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: (value) => value,
    reportStoreError: (_name, message) => errors.push(message),
    validate: () => ({ ok: true }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });
  assert.strictEqual(loaded, true);
  assert.ok(errors.some((msg) => msg.includes("async value")));
});

test("persistLoad hydrates stores from async drivers without async crypto flags", async () => {
  const applied: unknown[] = [];
  const envelope = JSON.stringify({
    v: 1,
    checksum: null,
    data: JSON.stringify({ ready: true }),
    updatedAtMs: Date.now(),
  });
  const persistConfig = makePersistConfig({
    key: "persist-async-driver",
    driver: { getItem: async () => envelope },
    deserialize: JSON.parse,
    checksum: "none",
    allowPlaintext: true,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);

  const loaded = persistLoad({
    name: "persistAsyncDriver",
    silent: true,
    getMeta: () => meta,
    getInitialState: () => ({ ready: false }),
    applyFeatureState: (value) => {
      applied.push(value);
      return value;
    },
    reportStoreError: () => undefined,
    validate: (value) => ({
      ok: isRecord(value) && value.ready === true,
      value,
    }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });

  assert.ok(loaded instanceof Promise);
  assert.strictEqual(await loaded, true);
  assert.deepStrictEqual(applied, [{ ready: true }]);
});

test("persistLoad preserves falsy serialized payloads from sync drivers", () => {
  const payloads = ["", "0", "false"] as const;

  payloads.forEach((payload) => {
    const applied: string[] = [];
    const errors: string[] = [];
    const envelope = JSON.stringify({
      v: 1,
      checksum: null,
      data: payload,
      updatedAtMs: Date.now(),
    });
    const persistConfig = makePersistConfig({
      key: `persist-falsy-sync-${payload || "empty"}`,
      driver: { getItem: () => envelope },
      serialize: (value: unknown) => String(value),
      deserialize: (value: string) => value,
      checksum: "none",
      allowPlaintext: true,
    });
    const options = makeNormalizedOptions(persistConfig);
    const meta = makeMeta(options);

    const loaded = persistLoad({
      name: `persistFalsySync-${payload || "empty"}`,
      silent: true,
      getMeta: () => meta,
      getInitialState: () => "fallback",
      applyFeatureState: (value) => {
        if (typeof value === "string") applied.push(value);
        return value;
      },
      reportStoreError: (_name, message) => errors.push(message),
      validate: (value) => ({ ok: typeof value === "string", value }),
      log: () => undefined,
      hashState: () => 1,
      deepClone,
      sanitize,
      shouldApply: () => true,
    });

    assert.strictEqual(loaded, true);
    assert.deepStrictEqual(applied, [payload]);
    assert.deepStrictEqual(errors, []);
  });
});

test("persistLoad preserves falsy serialized payloads from async drivers", async () => {
  const payloads = ["", "0", "false"] as const;

  for (const payload of payloads) {
    const applied: string[] = [];
    const errors: string[] = [];
    const envelope = JSON.stringify({
      v: 1,
      checksum: null,
      data: payload,
      updatedAtMs: Date.now(),
    });
    const persistConfig = makePersistConfig({
      key: `persist-falsy-async-${payload || "empty"}`,
      driver: { getItem: async () => envelope },
      serialize: (value: unknown) => String(value),
      deserialize: (value: string) => value,
      checksum: "none",
      allowPlaintext: true,
    });
    const options = makeNormalizedOptions(persistConfig);
    const meta = makeMeta(options);

    const loaded = persistLoad({
      name: `persistFalsyAsync-${payload || "empty"}`,
      silent: true,
      getMeta: () => meta,
      getInitialState: () => "fallback",
      applyFeatureState: (value) => {
        if (typeof value === "string") applied.push(value);
        return value;
      },
      reportStoreError: (_name, message) => errors.push(message),
      validate: (value) => ({ ok: typeof value === "string", value }),
      log: () => undefined,
      hashState: () => 1,
      deepClone,
      sanitize,
      shouldApply: () => true,
    });

    assert.ok(loaded instanceof Promise);
    assert.strictEqual(await loaded, true);
    assert.deepStrictEqual(applied, [payload]);
    assert.deepStrictEqual(errors, []);
  }
});

test("persistLoad handles schema failure after migration changes", () => {
  const applied: unknown[] = [];
  const errors: string[] = [];
  const envelope = JSON.stringify({
    v: 1,
    checksum: null,
    data: JSON.stringify({ ok: false }),
    updatedAtMs: Date.now(),
  });
  const persistConfig = makePersistConfig({
    key: "persist-schema",
    driver: { getItem: () => envelope },
    deserialize: JSON.parse,
    checksum: "none",
    allowPlaintext: true,
    onMigrationFail: "reset",
    migrate: (data: StoreValue) => {
      if (!isRecord(data)) return { ok: false };
      return { ok: data.ok === true };
    },
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options, { version: 2 });
  const loaded = persistLoad({
    name: "persistSchema",
    silent: true,
    getMeta: () => meta,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: (value) => {
      applied.push(value);
      return value;
    },
    reportStoreError: (_name, message) => errors.push(message),
    validate: (value) => ({
      ok: isRecord(value) && value.ok === true,
      value,
    }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });
  assert.strictEqual(loaded, true);
  assert.ok(applied.length >= 1);
  assert.ok(errors.some((msg) => msg.includes("failed schema; resetting to initial")));
});

test("persistLoad resets when validation fails after migration fallback", () => {
  const errors: string[] = [];
  const envelope = JSON.stringify({
    v: 1,
    checksum: null,
    data: JSON.stringify({ ok: false }),
    updatedAtMs: Date.now(),
  });
  const persistConfig = makePersistConfig({
    key: "persist-schema-reset",
    driver: { getItem: () => envelope },
    deserialize: JSON.parse,
    checksum: "none",
    allowPlaintext: true,
    onMigrationFail: "reset",
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options, { version: 2 });
  const loaded = persistLoad({
    name: "persistSchemaReset",
    silent: true,
    getMeta: () => meta,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: (value) => value,
    reportStoreError: (_name, message) => errors.push(message),
    validate: () => ({ ok: false }),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    shouldApply: () => true,
  });
  assert.strictEqual(loaded, true);
  assert.ok(errors.some((msg) => msg.includes("failed schema; resetting to initial")));
});

test("setupPersistWatch notifies on clear/remove/missing and handles read errors", () => {
  const notifications: Array<{ reason: string }> = [];
  let present = true;
  const watchState: PersistWatchState = {};
  const persistConfig = makePersistConfig({
    key: "watch-key",
    driver: {
      getItem: () => (present ? "value" : null),
    },
    onStorageCleared: (info) => notifications.push({ reason: info.reason }),
  });

  setupPersistWatch({ name: "watchStore", persistConfig, persistWatchState: watchState });
  assert.strictEqual(watchState.watchStore?.lastPresent, true);

  const makeStorageEvent = (key: string | null, newValue?: string | null) => {
    const StorageEventCtor = (window as unknown as { StorageEvent?: typeof StorageEvent }).StorageEvent;
    if (StorageEventCtor) {
      return new StorageEventCtor("storage", { key, newValue });
    }
    const evt = new Event("storage");
    Object.defineProperty(evt, "key", { value: key });
    Object.defineProperty(evt, "newValue", { value: newValue });
    return evt;
  };

  present = false;
  window.dispatchEvent(makeStorageEvent(null));
  setPersistPresence(watchState, "watchStore", true);
  window.dispatchEvent(makeStorageEvent("watch-key", null));
  setPersistPresence(watchState, "watchStore", true);
  window.dispatchEvent(new Event("focus"));

  const reasons = notifications.map((entry) => entry.reason);
  assert.ok(reasons.includes("clear"));
  assert.ok(reasons.includes("remove"));
  assert.ok(reasons.includes("missing"));

  const throwingConfig = {
    key: "watch-throw",
    driver: { getItem: () => { throw new Error("boom"); } },
    onStorageCleared: () => undefined,
  };
  const normalizedThrowingConfig = makePersistConfig({
    ...throwingConfig,
    checksum: "none",
    allowPlaintext: true,
  });
  setupPersistWatch({ name: "watchThrow", persistConfig: normalizedThrowingConfig, persistWatchState: watchState });
  assert.strictEqual(watchState.watchThrow?.lastPresent, false);
});

test("setupPersistWatch notifies when async drivers become missing", async () => {
  const notifications: Array<{ reason: string }> = [];
  let present = true;
  const watchState: PersistWatchState = {};
  const persistConfig = makePersistConfig({
    key: "watch-async",
    driver: {
      getItem: async () => (present ? "value" : null),
    },
    onStorageCleared: (info) => notifications.push({ reason: info.reason }),
  });

  setupPersistWatch({ name: "watchAsync", persistConfig, persistWatchState: watchState });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(watchState.watchAsync?.lastPresent, true);

  present = false;
  window.dispatchEvent(new Event("focus"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(notifications.map((entry) => entry.reason), ["missing"]);
  assert.strictEqual(watchState.watchAsync?.lastPresent, false);
});

test("persist feature flushes on pagehide and cleans up on delete/reset", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  let removeCalls = 0;
  const persistConfig = makePersistConfig({
    key: "persist-flush",
    driver: {
      getItem: () => null,
      setItem: () => { setCalls += 1; },
      removeItem: () => { removeCalls += 1; throw new Error("remove boom"); },
    },
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);
  const ctx = makeHookContext({
    name: "persistFlush",
    options,
    getMeta: () => meta,
    initialState: { ok: true },
    storeValue: { ok: true },
  });

  runtime.onStoreCreate?.(ctx);
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("beforeunload"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(setCalls >= 1);

  const originalRemove = window.removeEventListener;
  try {
    window.removeEventListener = () => { throw new Error("dispose boom"); };
    runtime.resetAll?.();
  } finally {
    window.removeEventListener = originalRemove;
  }

  runtime.beforeStoreDelete?.({ ...ctx, prev: { ok: true } });
  assert.ok(removeCalls >= 1);
});

test("persist feature removes unload flush listeners when a store is deleted and recreated", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  const persistConfig = makePersistConfig({
    key: "persist-recreate",
    driver: {
      getItem: () => null,
      setItem: () => { setCalls += 1; },
      removeItem: () => undefined,
    },
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);
  const ctx = makeHookContext({
    name: "persistRecreate",
    options,
    getMeta: () => meta,
    initialState: { ok: true },
    storeValue: { ok: true },
  });

  runtime.onStoreCreate?.(ctx);
  runtime.beforeStoreDelete?.({ ...ctx, prev: { ok: true } });
  runtime.onStoreCreate?.(ctx);

  setCalls = 0;
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("beforeunload"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.strictEqual(setCalls, 1);
});

test("persist feature swallows async removeItem rejections during store delete", async () => {
  const runtime = createPersistFeatureRuntime();
  const persistConfig = makePersistConfig({
    key: "persist-async-remove",
    driver: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => Promise.reject(new Error("remove reject")),
    },
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);
  const ctx = makeHookContext({
    name: "persistAsyncRemove",
    options,
    getMeta: () => meta,
    initialState: { ok: true },
    storeValue: { ok: true },
  });

  let unhandled: unknown = null;
  const onUnhandled = (reason: unknown) => {
    unhandled = reason;
  };
  process.once("unhandledRejection", onUnhandled);

  try {
    runtime.beforeStoreDelete?.({ ...ctx, prev: { ok: true } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(unhandled, null);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
});

test("persist feature handles async load failures with pending saves", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  let throwOnGetMeta = false;
  const persistConfig = makePersistConfig({
    key: "persist-async",
    driver: {
      getItem: () => Promise.resolve(null),
      setItem: () => { setCalls += 1; },
    },
    decryptAsync: async (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  });
  const options = makeNormalizedOptions(persistConfig);
  const meta = makeMeta(options);
  const ctx = makeHookContext({
    name: "persistAsync",
    options,
    getMeta: () => {
      if (throwOnGetMeta) {
        throwOnGetMeta = false;
        throw new Error("meta boom");
      }
      return meta;
    },
    initialState: { ok: true },
    storeValue: { ok: true },
  });
  runtime.onStoreCreate?.(ctx);
  throwOnGetMeta = true;
  runtime.onStoreWrite?.({ ...ctx, action: "set", prev: { ok: true }, next: { ok: true } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(setCalls >= 1);
});

test("persist feature reports sensitive data and key collisions", () => {
  const runtime = createPersistFeatureRuntime();
  const errors: string[] = [];
  const warnings: string[] = [];
  const baseConfig = makePersistConfig({
    key: "shared-key",
    driver: { getItem: () => null, setItem: () => undefined },
    checksum: "none",
    allowPlaintext: true,
  });
  const baseOptions = makeNormalizedOptions(baseConfig);
  const baseMeta = makeMeta(baseOptions);
  const baseCtx = makeHookContext({
    name: "persistA",
    options: baseOptions,
    getMeta: () => baseMeta,
    initialState: { ok: true },
    storeValue: { ok: true },
    reportStoreError: (message) => errors.push(message),
    warn: (message) => warnings.push(message),
    isDev: () => true,
  });

  runtime.onStoreCreate?.(baseCtx);
  runtime.onStoreCreate?.({ ...baseCtx, name: "persistB" });

  const sensitiveConfig = makePersistConfig({
    ...baseConfig,
    key: "sensitive-key",
    sensitiveData: true,
  });
  const sensitiveOptions = makeNormalizedOptions(sensitiveConfig);
  const sensitiveMeta = makeMeta(sensitiveOptions);
  const sensitiveCtx = makeHookContext({
    name: "persistSensitive",
    options: sensitiveOptions,
    getMeta: () => sensitiveMeta,
    initialState: { ok: true },
    storeValue: { ok: true },
    reportStoreError: (message) => errors.push(message),
    warn: (message) => warnings.push(message),
    isDev: () => true,
  });

  runtime.onStoreCreate?.(sensitiveCtx);

  assert.ok(warnings.some((message) => message.includes("Persist key collision")));
  assert.ok(errors.some((message) => message.includes("marked sensitiveData")));
});

test("validateCryptoPair reports encrypt/decrypt failures", () => {
  const encryptThrows = validateCryptoPair(
    "cryptoFail",
    () => {
      throw new Error("boom");
    },
    (value) => value
  );
  assert.strictEqual(encryptThrows.ok, false);
  assert.ok((encryptThrows.reason ?? "").includes("encrypt failed"));

  const encryptNonString = validateCryptoPair("cryptoFail", () => 123 as unknown as string, (value) => value);
  assert.strictEqual(encryptNonString.ok, false);
  assert.ok((encryptNonString.reason ?? "").includes("encrypt must return a string"));

  const decryptNonString = validateCryptoPair("cryptoFail", (value) => value, () => 123 as unknown as string);
  assert.strictEqual(decryptNonString.ok, false);
  assert.ok((decryptNonString.reason ?? "").includes("decrypt must return a string"));
});

test("normalizePersistOptions handles storage access errors and probe failures", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
  try {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage boom");
      },
    });
    const fallback = normalizePersistOptions(true, "storageFail");
    assert.ok(fallback);
  } finally {
    if (descriptor) {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  }

  const throwingEncrypt = () => {
    throw new Error("probe boom");
  };
  const res = normalizePersistOptions({
    encrypt: (_value: string): string => {
      throwingEncrypt();
    },
    decrypt: (v: string) => v,
    allowPlaintext: true,
  }, "probeFail");
  assert.ok(res);
});

test("normalizePersistOptions tolerates encrypt probe errors for sensitive data", () => {
  const res = normalizePersistOptions({
    sensitiveData: true,
    encrypt: (_value: string) => {
      throw new Error("encrypt probe fail");
    },
    decrypt: (value: string) => value,
  }, "sensitiveProbe");
  assert.ok(res);
});

test("computePersistChecksum falls back to node crypto", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
    const checksum = await computePersistChecksum("sha256", "payload");
    assert.strictEqual(typeof checksum, "string");
    assert.strictEqual((checksum as string).length, 64);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "crypto", descriptor);
    } else {
      delete (globalThis as unknown as Record<string, unknown>).crypto;
    }
  }
});
