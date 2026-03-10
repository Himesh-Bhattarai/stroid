import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import "../src/persist.js";
import { clearAllStores } from "../src/runtime-admin.js";
import { getStoreMeta } from "../src/runtime-tools.js";
import { createStore, setStore, getStore, deleteStore, resetStore } from "../src/store.js";
import { resetAllStoresForTest } from "../src/testing.js";
import { hashState } from "../src/utils.js";

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

test("persist critical failures still surface via onError in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
      },
      onError: (msg) => loadErrors.push(msg),
    });

    assert.ok(loadErrors.some((msg) => msg.includes('Could not load store "secureCart"')));
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
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const indexPath = path.join(repoRoot, "src", "index.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const stroid = await import(pathToFileURL(${JSON.stringify(indexPath)}).href);
    const errors = [];

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
      },
      onError: (msg) => errors.push(msg),
    });

    assert.deepStrictEqual(stroid.getStore("cart"), { items: [1] });
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

  assert.deepStrictEqual(removals, ["cart-delete-race"]);
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
