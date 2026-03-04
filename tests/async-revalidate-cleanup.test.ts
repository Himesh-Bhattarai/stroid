import assert from "node:assert";
import { test } from "node:test";
import { enableRevalidateOnFocus } from "../src/async.js";
import { createStore, deleteStore, clearAllStores } from "../src/store.js";

test("enableRevalidateOnFocus removes listeners when store is deleted", () => {
  clearAllStores();

  const addCalls: Array<{ type: string; handler: (...args: any[]) => void }> = [];
  const removeCalls: typeof addCalls = [];

  // Minimal window shim
  const win: any = {
    addEventListener: (type: string, handler: any) => addCalls.push({ type, handler }),
    removeEventListener: (type: string, handler: any) => removeCalls.push({ type, handler }),
  };

  // @ts-ignore
  const originalWindow = globalThis.window;
  // @ts-ignore
  globalThis.window = win;

  createStore("focus", { value: 1 });
  enableRevalidateOnFocus("focus");

  deleteStore("focus"); // should trigger cleanup subscriber

  // Restore window
  // @ts-ignore
  globalThis.window = originalWindow;

  assert.strictEqual(addCalls.length, 2);
  assert.strictEqual(removeCalls.length, 2);
  assert.deepStrictEqual(
    removeCalls.map((c) => c.type).sort(),
    ["focus", "online"]
  );

  clearAllStores();
});
