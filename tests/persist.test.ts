import assert from "node:assert";
import { test } from "node:test";
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
