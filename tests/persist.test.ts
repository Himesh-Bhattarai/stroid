import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createStore, setStore, getStore, clearAllStores } from "../src/store.js";
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
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
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
      schema: (value: any) => (typeof value?.fullName === "string" ? value : false),
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
