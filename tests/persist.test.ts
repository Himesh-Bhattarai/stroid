import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createStore, setStore, getStore, clearAllStores } from "../src/store.js";

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
