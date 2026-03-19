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

test("flushPersistImmediately clears pending timers", async () => {
  const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const persistInFlight: Record<string, Promise<void> | null> = {};
  const persistSequence: Record<string, number> = Object.create(null);
  const persistWatchState: Record<string, { present?: boolean }> = Object.create(null);
  const plaintextWarningsIssued = new Set<string>();
  let calls = 0;

  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-key",
        driver: {
          setItem: async () => { calls += 1; },
        },
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
      },
      onError: undefined,
    },
  };

  const args = {
    name: "persist-store",
    persistTimers,
    persistInFlight,
    persistSequence,
    persistWatchState,
    plaintextWarningsIssued,
    exists: () => true,
    getMeta: () => meta as any,
    getStoreValue: () => ({ value: 1 }),
    reportStoreError: () => undefined,
    hashState: () => 1,
  };

  persistSave(args as any);
  assert.ok(persistTimers["persist-store"]);
  flushPersistImmediately("persist-store", args as any);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(!persistTimers["persist-store"]);
  assert.ok(calls >= 1);
});

test("normalizePersistOptions rejects invalid async crypto and plaintext sensitive stores", () => {
  assert.throws(
    () => normalizePersistOptions({ encryptAsync: async (v: string) => v } as unknown as any, "badAsync"),
    /encryptAsync/
  );
  assert.throws(
    () => normalizePersistOptions({ sensitiveData: true, encrypt: (v: string) => v, decrypt: (v: string) => v } as unknown as any, "badSensitive"),
    /sensitiveData/
  );
});

test("persistLoad reports non-string sync driver values", () => {
  const errors: string[] = [];
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-nonstring",
        driver: { getItem: () => ({ bad: true }) },
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
      },
    },
  };
  const loaded = persistLoad({
    name: "persistNonString",
    silent: true,
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
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

test("persistLoad handles schema failure after migration changes", () => {
  const applied: Array<{ ok: boolean }> = [];
  const errors: string[] = [];
  const envelope = JSON.stringify({
    v: 1,
    checksum: null,
    data: { ok: false },
    updatedAtMs: Date.now(),
  });
  const meta = {
    version: 2,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-schema",
        driver: { getItem: () => envelope },
        serialize: JSON.stringify,
        deserialize: (value: any) => value,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
        onMigrationFail: "reset",
        migrate: (data: any) => ({ ok: data.ok }),
      },
    },
  };
  const loaded = persistLoad({
    name: "persistSchema",
    silent: true,
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: (state: any) => applied.push(state),
    reportStoreError: (_name, message) => errors.push(message),
    validate: (value: any) => ({ ok: value.ok === true, value }),
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
    data: { ok: false },
    updatedAtMs: Date.now(),
  });
  const meta = {
    version: 2,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: {
      persist: {
        key: "persist-schema-reset",
        driver: { getItem: () => envelope },
        serialize: JSON.stringify,
        deserialize: (value: any) => value,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        checksum: "none",
        allowPlaintext: true,
        onMigrationFail: "reset",
      },
    },
  };
  const loaded = persistLoad({
    name: "persistSchemaReset",
    silent: true,
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
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
  const watchState: Record<string, { lastPresent?: boolean; dispose?: () => void }> = Object.create(null);
  const persistConfig = {
    key: "watch-key",
    driver: {
      getItem: () => (present ? "value" : null),
    },
    onStorageCleared: (info: { reason: string }) => notifications.push(info),
  };

  setupPersistWatch({ name: "watchStore", persistConfig: persistConfig as any, persistWatchState: watchState });
  assert.strictEqual(watchState.watchStore?.lastPresent, true);

  const makeStorageEvent = (key: string | null, newValue?: string | null) => {
    const StorageEventCtor = (window as any).StorageEvent;
    if (typeof StorageEventCtor === "function") {
      return new StorageEventCtor("storage", { key, newValue });
    }
    const evt = new Event("storage");
    Object.defineProperty(evt, "key", { value: key });
    Object.defineProperty(evt, "newValue", { value: newValue });
    return evt;
  };

  present = false;
  window.dispatchEvent(makeStorageEvent(null));
  setPersistPresence(watchState as any, "watchStore", true);
  window.dispatchEvent(makeStorageEvent("watch-key", null));
  setPersistPresence(watchState as any, "watchStore", true);
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
  setupPersistWatch({ name: "watchThrow", persistConfig: throwingConfig as any, persistWatchState: watchState });
  assert.strictEqual(watchState.watchThrow?.lastPresent, false);
});

test("persist feature flushes on pagehide and cleans up on delete/reset", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  let removeCalls = 0;
  const persistConfig = {
    key: "persist-flush",
    driver: {
      getItem: () => null,
      setItem: () => { setCalls += 1; },
      removeItem: () => { removeCalls += 1; throw new Error("remove boom"); },
    },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  };
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: { persist: persistConfig },
  };
  const ctx = {
    name: "persistFlush",
    options: { persist: persistConfig },
    getMeta: () => meta as any,
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    reportStoreError: () => undefined,
    warn: () => undefined,
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: () => ({ ok: true }),
  };

  runtime.onStoreCreate(ctx as any);
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

  runtime.beforeStoreDelete(ctx as any);
  assert.ok(removeCalls >= 1);
});

test("persist feature handles async load failures with pending saves", async () => {
  const runtime = createPersistFeatureRuntime();
  let setCalls = 0;
  let throwOnGetMeta = false;
  const persistConfig = {
    key: "persist-async",
    driver: {
      getItem: () => Promise.resolve(null),
      setItem: () => { setCalls += 1; },
    },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    decryptAsync: async (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
    onStorageCleared: () => undefined,
  };
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    options: { persist: persistConfig },
  };
  const ctx = {
    name: "persistAsync",
    options: { persist: persistConfig },
    getMeta: () => {
      if (throwOnGetMeta) {
        throwOnGetMeta = false;
        throw new Error("meta boom");
      }
      return meta as any;
    },
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    reportStoreError: () => undefined,
    warn: () => undefined,
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: () => ({ ok: true }),
  };
  runtime.onStoreCreate(ctx as any);
  throwOnGetMeta = true;
  runtime.onStoreWrite(ctx as any);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(setCalls >= 1);
});

test("persist feature reports sensitive data and key collisions", () => {
  const runtime = createPersistFeatureRuntime();
  const errors: string[] = [];
  const warnings: string[] = [];
  const baseConfig = {
    key: "shared-key",
    driver: { getItem: () => null, setItem: () => undefined },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    checksum: "none",
    allowPlaintext: true,
  };
  const baseCtx = {
    getMeta: () => ({ version: 1, updatedAt: new Date().toISOString(), updatedAtMs: Date.now(), options: { persist: baseConfig } }),
    getInitialState: () => ({ ok: true }),
    applyFeatureState: () => undefined,
    getStoreValue: () => ({ ok: true }),
    hasStore: () => true,
    reportStoreError: (message: string) => errors.push(message),
    warn: (message: string) => warnings.push(message),
    log: () => undefined,
    hashState: () => 1,
    deepClone,
    sanitize,
    validate: () => ({ ok: true }),
    isDev: () => true,
  };

  runtime.onStoreCreate({ ...baseCtx, name: "persistA", options: { persist: baseConfig } } as any);
  runtime.onStoreCreate({ ...baseCtx, name: "persistB", options: { persist: baseConfig } } as any);

  const sensitiveConfig = { ...baseConfig, key: "sensitive-key", sensitiveData: true };
  runtime.onStoreCreate({ ...baseCtx, name: "persistSensitive", options: { persist: sensitiveConfig } } as any);

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
    encrypt: throwingEncrypt as any,
    decrypt: (v: string) => v,
    allowPlaintext: true,
  } as any, "probeFail");
  assert.ok(res);
});

test("normalizePersistOptions tolerates encrypt probe errors for sensitive data", () => {
  const res = normalizePersistOptions({
    sensitiveData: true,
    encrypt: () => {
      throw new Error("encrypt probe fail");
    },
    decrypt: (value: string) => value,
  } as any, "sensitiveProbe");
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
      delete (globalThis as any).crypto;
    }
  }
});
