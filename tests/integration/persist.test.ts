/**
 * @module tests/persist.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/persist.test.
 *
 * Consumers: Test runner.
 */
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import "../../src/persist.js";
import { configureStroid, resetConfig } from "../../src/config.js";
import { clearAllStores } from "../../src/runtime-admin/index.js";
import { getStoreMeta } from "../../src/runtime-tools/index.js";
import { createStore, setStore, getStore, deleteStore, resetStore } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { flushPersistImmediately } from "../../src/features/persist/save.js";
import { isIdentityCrypto } from "../../src/features/persist/crypto.js";
import { hashState } from "../../src/utils.js";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("persist setItem errors surface via onError without throwing", async () => {
  clearAllStores();
  const errors: string[] = [];

  const driver = {
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    getItem: () => null,
  };

  createStore(
    "cart",
    { items: [1] },
    {
      persist: {
        driver,
        key: "cart-key",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
      },
      onError: (msg) => errors.push(msg),
    }
  );

  setStore("cart", { items: [1, 2] });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.strictEqual(errors.length, 1);
  assert.ok(errors[0].includes('Could not persist store "cart"'));
  assert.deepStrictEqual(getStore("cart"), { items: [1, 2] });

  clearAllStores();
});

test("persist true surfaces localStorage quota errors without throwing", async () => {
  clearAllStores();
  const errors: string[] = [];
  const originalWindow = (globalThis as any).window;

  const throwingStorage = {
    getItem: () => null,
    setItem: () => {
      const err = new Error("QuotaExceededError");
      (err as any).name = "QuotaExceededError";
      throw err;
    },
    removeItem: () => {},
  };

  (globalThis as any).window = {
    localStorage: throwingStorage,
    sessionStorage: throwingStorage,
  };

  try {
    createStore("quotaStore", { value: 1 }, {
      persist: true,
      onError: (msg) => errors.push(msg),
    });

    setStore("quotaStore", { value: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepStrictEqual(getStore("quotaStore"), { value: 2 });
    assert.ok(errors.some((msg) => msg.includes("QuotaExceededError")));
  } finally {
    clearAllStores();
    (globalThis as any).window = originalWindow;
  }
});

test("persist skips oversized payloads via maxSize", () => {
  clearAllStores();
  const errors: string[] = [];
  const driver = {
    getItem: () => "x".repeat(200),
    setItem: () => {},
    removeItem: () => {},
  };

  createStore("oversized", { value: 1 }, {
    persist: {
      driver,
      key: "oversized-key",
      maxSize: 50,
      allowPlaintext: true,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
    onError: (msg) => errors.push(msg),
  });

  assert.deepStrictEqual(getStore("oversized"), { value: 1 });
  assert.ok(errors.some((msg) => msg.includes("maxSize")));
  clearAllStores();
});

test("persist warns when maxSize is not configured", () => {
  clearAllStores();
  const warnings: string[] = [];
  configureStroid({ logSink: { warn: (msg) => warnings.push(msg) } });

  const payload = "x".repeat(1_050_000);
  const serialized = JSON.stringify({ payload });
  const stored = JSON.stringify({
    v: 1,
    checksum: hashState(serialized),
    data: serialized,
  });

  const driver = {
    getItem: () => stored,
    setItem: () => {},
    removeItem: () => {},
  };

  createStore("noMaxSize", { value: 1 }, {
    persist: {
      driver,
      key: "no-max",
      allowPlaintext: true,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  assert.ok(warnings.some((msg) => msg.includes("maxSize")));

  resetConfig();
  clearAllStores();
});

test("persist supports async crypto and sha256 checksums", async () => {
  clearAllStores();
  let stored: string | null = null;
  const driver = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
  };

  const persist = {
    driver,
    key: "secure-async",
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encryptAsync: async (value: string) => `enc:${value}`,
    decryptAsync: async (value: string) => value.replace(/^enc:/, ""),
    checksum: "sha256" as const,
  };

  createStore("secureAsync", { value: 1 }, { persist });
  setStore("secureAsync", { value: 2 });
  await wait(20);

  assert.ok(stored?.startsWith("enc:"));

  resetAllStoresForTest();

  createStore("secureAsync", { value: 0 }, { persist });
  await wait(20);

  assert.deepStrictEqual(getStore("secureAsync"), { value: 2 });
});

test("persist restores state across reloads", async () => {
  clearAllStores();
  let stored: string | null = null;
  const driver = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
  };
  const persist = {
    driver,
    key: "reload-store",
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    allowPlaintext: true,
  };

  createStore("reloadStore", { value: 1 }, { persist });
  setStore("reloadStore", { value: 2 });
  const startedAt = Date.now();
  let persistedValue: number | null = null;
  while (Date.now() - startedAt < 100) {
    if (stored) {
      try {
        const envelope = JSON.parse(stored);
        const data = JSON.parse(envelope.data);
        if (typeof data?.value === "number") {
          persistedValue = data.value;
          if (persistedValue === 2) break;
        }
      } catch {
        // ignore parse errors during writes
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.strictEqual(persistedValue, 2, "expected persisted payload to capture the updated value before reload");

  resetAllStoresForTest();

  createStore("reloadStore", { value: 0 }, { persist });
  assert.deepStrictEqual(getStore("reloadStore"), { value: 2 });
});

test("persist sensitiveData stores require encrypt hooks at creation time", () => {
  clearAllStores();

  assert.throws(() => {
    createStore("sensitivePersist", { token: "secret" }, {
      persist: {
        driver: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        key: "sensitive-persist",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        sensitiveData: true,
      },
    });
  }, /sensitiveData/);

  assert.strictEqual(getStore("sensitivePersist"), null);
});

test("persist disables when encrypt/decrypt do not round-trip", async () => {
  clearAllStores();
  const errors: string[] = [];
  const writes: string[] = [];
  const driver = {
    getItem: () => null,
    setItem: (_key: string, value: string) => {
      writes.push(value);
    },
    removeItem: () => {},
  };

  createStore("badCrypto", { value: 1 }, {
    persist: {
      driver,
      key: "bad-crypto",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (value: string) => `enc:${value}`,
      decrypt: (value: string) => value, // not the inverse of encrypt
    },
    onError: (msg) => errors.push(msg),
  });

  setStore("badCrypto", { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(errors.some((msg) => msg.includes("round-trip")));
  assert.strictEqual(writes.length, 0);
});

test("isIdentityCrypto ignores toString errors", () => {
  const throwing = ((value: string) => {
    throw new Error(`fail:${value}`);
  }) as (value: string) => string;
  (throwing as any).toString = () => {
    throw new Error("toString failed");
  };

  assert.doesNotThrow(() => {
    assert.strictEqual(isIdentityCrypto(throwing), false);
  });
});

test("persist warns once per store when defaults persist in plaintext", async () => {
  clearAllStores();
  const warned: string[] = [];
  const onErrorMessages: string[] = [];
  const originalConsoleWarn = console.warn;
  console.warn = (message) => {
    warned.push(String(message ?? ""));
  };

  try {
    createStore("plaintextPersistWarning", { value: 0 }, {
      onError: (msg) => { onErrorMessages.push(msg); },
      persist: {
        driver: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        key: "plaintext-persist-warning",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        // omit encrypt/decrypt to use defaults (plaintext)
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    setStore("plaintextPersistWarning", { value: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    console.warn = originalConsoleWarn;
  }

  const message = "[stroid/persist] Store 'plaintextPersistWarning' is persisted in plaintext. Provide encrypt/decrypt hooks to protect sensitive data.";
  assert.strictEqual(onErrorMessages.filter((msg) => msg === message).length, 1);
  assert.strictEqual(warned.filter((msg) => msg.includes(message)).length, 1);
});

test("persist critical failures still surface via onError in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const storePath = path.join(repoRoot, "src", "store.ts");
  const persistPath = path.join(repoRoot, "src", "persist.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    await import(pathToFileURL(${JSON.stringify(persistPath)}).href);
    const { createStore, getStore, clearAllStores } = await import(pathToFileURL(${JSON.stringify(storePath)}).href);

    const checksumErrors = [];
    const serialized = JSON.stringify({ items: [9] });
    createStore("cart", { items: [1] }, {
      allowSSRGlobalStore: true,
      persist: {
        driver: {
          getItem: () => JSON.stringify({ v: 1, checksum: 0, data: serialized }),
          setItem: () => {},
          removeItem: () => {},
        },
        key: "cart-prod-checksum",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v) => v,
        decrypt: (v) => v,
        allowPlaintext: true,
      },
      onError: (msg) => checksumErrors.push(msg),
    });

    assert.deepStrictEqual(getStore("cart"), { items: [1] });
    assert.ok(checksumErrors.some((msg) => msg.includes('Checksum mismatch loading store "cart"')));
    clearAllStores();

    const loadErrors = [];
    createStore("secureCart", { items: [1] }, {
      allowSSRGlobalStore: true,
      persist: {
        driver: {
          getItem: () => "encrypted-payload",
          setItem: () => {},
          removeItem: () => {},
        },
        key: "cart-prod-load",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v) => v,
        decrypt: () => {
          throw new Error("decrypt failed");
        },
        allowPlaintext: true,
      },
      onError: (msg) => loadErrors.push(msg),
    });

    assert.ok(loadErrors.some((msg) => msg.includes("decrypt failed") || msg.includes("encrypt/decrypt")));
    clearAllStores();
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("full package stays lean and requires explicit persist registration in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const indexPath = path.join(repoRoot, "src", "index.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const stroid = await import(pathToFileURL(${JSON.stringify(indexPath)}).href);
    const errors = [];

    assert.throws(() => {
      stroid.createStore("cart", { items: [1] }, {
        allowSSRGlobalStore: true,
        persist: {
          driver: {
            getItem: () => JSON.stringify({ v: 1, checksum: 0, data: JSON.stringify({ items: [2] }) }),
            setItem: () => {},
            removeItem: () => {},
          },
          key: "cart-prod-root",
          serialize: JSON.stringify,
          deserialize: JSON.parse,
          encrypt: (v) => v,
          decrypt: (v) => v,
          allowPlaintext: true,
        },
        onError: (msg) => errors.push(msg),
      });
    }, /not registered/);

    assert.ok(errors.some((msg) => msg.includes('Store "cart" requested persist support, but "persist" is not registered.')));
    assert.strictEqual(typeof stroid.clearAllStores, "undefined");
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("persist onMigrationFail can recover data after a schema version change", () => {
  clearAllStores();
  const errors: string[] = [];
  const serialized = JSON.stringify({ name: "Alex" });
  const driver = {
    getItem: () => JSON.stringify({
      v: 1,
      checksum: hashState(serialized),
      data: serialized,
    }),
    setItem: () => {},
    removeItem: () => {},
  };

  createStore(
    "profile",
    { fullName: "Initial" },
    {
      version: 2,
      validate: (value: any) => (typeof value?.fullName === "string" ? value : false),
      persist: {
        driver,
        key: "profile-migration",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        onMigrationFail: (oldState: any) => ({ fullName: oldState.name }),
      },
      onError: (msg) => errors.push(msg),
    }
  );

  assert.deepStrictEqual(getStore("profile"), { fullName: "Alex" });
  assert.ok(errors.some((msg) => msg.includes('No migration path from v1 to v2 for "profile"')));

  clearAllStores();
});

test('persist onMigrationFail "keep" still validates partial migration results', () => {
  clearAllStores();
  const errors: string[] = [];
  const serialized = JSON.stringify({ name: "Alex" });
  const driver = {
    getItem: () => JSON.stringify({
      v: 1,
      checksum: hashState(serialized),
      data: serialized,
    }),
    setItem: () => {},
    removeItem: () => {},
  };

  createStore("partialMigration", { fullName: "Initial" }, {
    version: 3,
    validate: (value: any) => (typeof value?.fullName === "string" ? value : false),
    persist: {
      driver,
      key: "partial-migration",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
      migrations: {
        2: (state: any) => ({ legacyName: state.name }),
        3: () => {
          throw new Error("step boom");
        },
      },
      onMigrationFail: "keep",
    },
    onError: (msg) => errors.push(msg),
  });

  assert.deepStrictEqual(getStore("partialMigration"), { fullName: "Initial" });
  assert.ok(errors.some((msg) => msg.includes('Migration to v3 failed for "partialMigration"')));
});

test("grouped persist options support nested version and migrations", () => {
  clearAllStores();
  const serialized = JSON.stringify({ name: "Alex" });
  const driver = {
    getItem: () => JSON.stringify({
      v: 1,
      checksum: hashState(serialized),
      data: serialized,
    }),
    setItem: () => {},
    removeItem: () => {},
  };

  createStore(
    "profileGrouped",
    { fullName: "Initial" },
    {
      validate: (value: any) => (typeof value?.fullName === "string" ? value : false),
      persist: {
        driver,
        key: "profile-grouped-migration",
        version: 2,
        migrations: {
          2: (state: any) => ({ fullName: state.name }),
        },
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
      },
    }
  );

  assert.deepStrictEqual(getStore("profileGrouped"), { fullName: "Alex" });

  clearAllStores();
});

test("persist onStorageCleared fires when a saved key disappears mid-session", async () => {
  clearAllStores();
  const events: Array<{ name: string; key: string; reason: string }> = [];
  const listeners: Record<string, Set<(event?: any) => void>> = {
    storage: new Set(),
    focus: new Set(),
  };
  const store = new Map<string, string>();
  const win: any = {
    addEventListener: (type: string, handler: (event?: any) => void) => {
      listeners[type] ??= new Set();
      listeners[type].add(handler);
    },
    removeEventListener: (type: string, handler: (event?: any) => void) => {
      listeners[type]?.delete(handler);
    },
  };
  const driver = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };

  // @ts-ignore
  const originalWindow = globalThis.window;
  // @ts-ignore
  globalThis.window = win;

  try {
    createStore("prefs", { theme: "dark" }, {
      persist: {
        driver,
        key: "prefs-storage",
        serialize: JSON.stringify,
        deserialize: JSON.parse,
        encrypt: (v: string) => v,
        decrypt: (v: string) => v,
        onStorageCleared: (info) => events.push(info),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    store.delete("prefs-storage");
    listeners.focus.forEach((handler) => handler());

    assert.deepStrictEqual(events, [{
      name: "prefs",
      key: "prefs-storage",
      reason: "missing",
    }]);
  } finally {
    clearAllStores();
    // @ts-ignore
    globalThis.window = originalWindow;
  }
});

test("deleteStore clears queued persist timers before they can rewrite storage", async () => {
  clearAllStores();
  const writes: string[] = [];
  const removals: string[] = [];
  const driver = {
    getItem: () => null,
    setItem: (_key: string, value: string) => {
      writes.push(value);
    },
    removeItem: (key: string) => {
      removals.push(key);
    },
  };

  createStore("cart", { items: [1] }, {
    persist: {
      driver,
      key: "cart-delete-race",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  setStore("cart", { items: [1, 2] });
  deleteStore("cart");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(removals.includes("cart-delete-race"));
  assert.strictEqual(writes.length, 0);
});

test("resetStore persists the reset state", async () => {
  clearAllStores();
  const writes: string[] = [];
  const driver = {
    getItem: () => null,
    setItem: (_key: string, value: string) => {
      writes.push(value);
    },
    removeItem: () => {},
  };

  createStore("prefs", { theme: "dark" }, {
    persist: {
      driver,
      key: "prefs-reset",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  setStore("prefs", { theme: "light" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  writes.length = 0;

  resetStore("prefs");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.strictEqual(writes.length, 1);
  const envelope = JSON.parse(writes[0]);
  assert.strictEqual(envelope.data, JSON.stringify({ theme: "dark" }));
});

test("10 rapid setStore calls produce exactly 1 persist write in the same tick", async () => {
  clearAllStores();
  const writes: string[] = [];
  const driver = {
    getItem: () => null,
    setItem: (_key: string, value: string) => {
      writes.push(value);
    },
    removeItem: () => {},
  };

  createStore("burst", { value: 0 }, {
    persist: {
      driver,
      key: "burst-persist",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  writes.length = 0;

  for (let i = 0; i < 10; i++) {
    setStore("burst", { value: i + 1 });
  }

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.strictEqual(writes.length, 1);
  const envelope = JSON.parse(writes[0]);
  assert.strictEqual(envelope.data, JSON.stringify({ value: 10 }));
});

test("persist skips stale queued writes when newer updates arrive during in-flight save", async () => {
  clearAllStores();
  const writes: string[] = [];
  let blockNext = false;
  let release: (() => void) | null = null;

  const driver = {
    getItem: () => null,
    setItem: (_key: string, value: string) => {
      writes.push(value);
      if (blockNext) {
        blockNext = false;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    },
    removeItem: () => {},
  };

  createStore("persistQueue", { value: 0 }, {
    persist: {
      driver,
      key: "persist-queue",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  writes.length = 0;

  blockNext = true;
  setStore("persistQueue", { value: 1 });

  const startedAt = Date.now();
  while (!release) {
    if (Date.now() - startedAt > 200) {
      throw new Error("persist save did not start in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  setStore("persistQueue", { value: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  setStore("persistQueue", { value: 3 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  release();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.strictEqual(writes.length, 2);
  const envelope = JSON.parse(writes[writes.length - 1]);
  assert.strictEqual(envelope.data, JSON.stringify({ value: 3 }));
});

test("createStore does not overwrite existing persisted state during init", async () => {
  clearAllStores();
  const writes: string[] = [];
  const persisted = JSON.stringify({
    v: 1,
    checksum: hashState(JSON.stringify({ name: "Bob" })),
    data: JSON.stringify({ name: "Bob" }),
  });

  createStore("persistedUser", { name: "Alice" }, {
    persist: {
      driver: {
        getItem: () => persisted,
        setItem: (_key: string, value: string) => { writes.push(value); },
        removeItem: () => {},
      },
      key: "persisted-user",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepStrictEqual(getStore("persistedUser"), { name: "Bob" });
  assert.deepStrictEqual(writes, []);
});

test("persisted loads restore updatedAt metadata from storage", () => {
  clearAllStores();
  const restoredAt = "2020-01-02T03:04:05.000Z";
  const persistedState = JSON.stringify({ name: "Bob" });
  const persisted = JSON.stringify({
    v: 1,
    updatedAt: restoredAt,
    checksum: hashState(persistedState),
    data: persistedState,
  });

  createStore("persistedMetaUser", { name: "Alice" }, {
    persist: {
      driver: {
        getItem: () => persisted,
        setItem: () => {},
        removeItem: () => {},
      },
      key: "persisted-meta-user",
      serialize: JSON.stringify,
      deserialize: JSON.parse,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    },
  });

  assert.deepStrictEqual(getStore("persistedMetaUser"), { name: "Bob" });
  assert.strictEqual(getStoreMeta("persistedMetaUser")?.updatedAt, restoredAt);
});

test("persist uses sessionStorage when configured with the session shorthand", async () => {
  clearAllStores();
  const originalWindow = (globalThis as any).window;
  const sessionWrites: string[] = [];
  const localWrites: string[] = [];
  const storageFactory = (writes: string[]) => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(`${key}:${value}`);
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  };

  (globalThis as any).window = {
    localStorage: storageFactory(localWrites),
    sessionStorage: storageFactory(sessionWrites),
  };

  try {
    createStore("sessionPrefs", { theme: "dark" }, {
      persist: "session",
    });

    setStore("sessionPrefs", { theme: "light" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(sessionWrites.some((entry) => entry.startsWith("stroid_sessionPrefs:")));
    assert.deepStrictEqual(localWrites, []);
  } finally {
    clearAllStores();
    (globalThis as any).window = originalWindow;
  }
});

test("persist true uses localStorage in browser-like environments", async () => {
  clearAllStores();
  const originalWindow = (globalThis as any).window;
  const sessionWrites: string[] = [];
  const localWrites: string[] = [];
  const storageFactory = (writes: string[]) => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(`${key}:${value}`);
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  };

  (globalThis as any).window = {
    localStorage: storageFactory(localWrites),
    sessionStorage: storageFactory(sessionWrites),
  };

  try {
    createStore("localPrefs", { theme: "dark" }, {
      persist: true,
    });

    setStore("localPrefs", { theme: "light" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(localWrites.some((entry) => entry.startsWith("stroid_localPrefs:")));
    assert.deepStrictEqual(sessionWrites, []);
  } finally {
    clearAllStores();
    (globalThis as any).window = originalWindow;
  }
});

test("persist custom serialize deserialize encrypt and decrypt hooks round-trip state", async () => {
  clearAllStores();
  const writes: string[] = [];
  const driver = {
    stored: "" as string,
    getItem() {
      return this.stored || null;
    },
    setItem(_key: string, value: string) {
      writes.push(value);
      this.stored = value;
    },
    removeItem() {
      this.stored = "";
    },
  };

  createStore("securePrefs", { theme: "dark" }, {
    persist: {
      driver,
      key: "secure-prefs",
      serialize: (value: any) => `SER:${JSON.stringify(value)}`,
      deserialize: (value: string) => JSON.parse(value.slice(4)),
      encrypt: (value: string) => `ENC:${value}`,
      decrypt: (value: string) => value.slice(4),
    },
  });

  setStore("securePrefs", { theme: "light" });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.strictEqual(writes.length > 0, true);
  assert.ok(writes[writes.length - 1].startsWith("ENC:"));

  resetAllStoresForTest();

  createStore("securePrefs", { theme: "fallback" }, {
    persist: {
      driver,
      key: "secure-prefs",
      serialize: (value: any) => `SER:${JSON.stringify(value)}`,
      deserialize: (value: string) => JSON.parse(value.slice(4)),
      encrypt: (value: string) => `ENC:${value}`,
      decrypt: (value: string) => value.slice(4),
    },
  });

  assert.deepStrictEqual(getStore("securePrefs"), { theme: "light" });
});

test("persistSave uses a zero-argument exists callback", async () => {
  const calls: number[] = [];
  const cfg = {
    driver: {
      setItem: () => {},
      getItem: () => null,
      removeItem: () => {},
    },
    key: "persist-exists",
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    checksum: "none" as const,
    allowPlaintext: true,
  };
  const meta = {
    version: 1,
    updatedAt: new Date().toISOString(),
    options: {
      persist: cfg,
      migrations: {},
    },
  };

  flushPersistImmediately("existsStore", {
    name: "existsStore",
    persistTimers: {},
    persistInFlight: {},
    persistSequence: {},
    persistWatchState: {},
    plaintextWarningsIssued: new Set(),
    exists: (...args: any[]) => {
      calls.push(args.length);
      return true;
    },
    getMeta: () => meta,
    getStoreValue: () => ({ value: 1 }),
    reportStoreError: () => {},
    hashState,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(calls, [0]);
});



