import test from "node:test";
import assert from "node:assert";
import "../src/sync.js";
import { createStore, setStore } from "../src/store.js";

test("sync reports missing BroadcastChannel in non-browser environments", () => {
  const errors: string[] = [];
  createStore("shared", { value: 1 }, {
    sync: true,
    onError: (msg) => { errors.push(msg); },
  });

  assert.ok(errors.some((msg) => msg.includes("BroadcastChannel not available")));
});

test("sync option accepts object config without throwing", () => {
  const errors: string[] = [];
  createStore("syncConfig", { value: 1 }, {
    sync: { maxPayloadBytes: 1024 },
    onError: (msg) => { errors.push(msg); },
  });

  setStore("syncConfig", { value: 2 });
  assert.strictEqual(errors.length > 0, true);
});
