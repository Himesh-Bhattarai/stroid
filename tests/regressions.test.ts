import test from "node:test";
import assert from "node:assert";
import { configureStroid } from "../src/config.js";
import { clearAllStores } from "../src/runtime-admin.js";
import { createStore, setStore } from "../src/store.js";
import { subscribeWithSelector } from "../src/selectors.js";
import { broadcastSync } from "../src/features/sync.js";
import { hashState } from "../src/utils.js";

test("validator with side effects runs once per write", () => {
  clearAllStores();
  let calls = 0;
  createStore("x", { value: 0 }, {
    validator: (next) => {
      calls += 1;
      return (next as any).value >= 0;
    },
  });
  calls = 0;
  setStore("x", "value", 5);
  assert.strictEqual(calls, 1);
});

test("subscribeWithSelector does not fire on first notification", async () => {
  clearAllStores();
  createStore("x", { count: 0 });
  const calls: Array<[number, number]> = [];
  subscribeWithSelector(
    "x",
    (s: any) => s.count,
    Object.is,
    (next, prev) => calls.push([next as number, prev as number])
  );

  setStore("x", "count", 0);
  await Promise.resolve();
  assert.strictEqual(calls.length, 0);

  setStore("x", "count", 1);
  await Promise.resolve();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], [1, 0]);
});

test("critical fires when sync payload is dropped", () => {
  const captured: string[] = [];
  configureStroid({
    logSink: {
      critical: (msg: string) => captured.push(msg),
    },
  });

  broadcastSync({
    name: "big",
    syncOption: { maxPayloadBytes: 10 },
    syncChannels: { big: { postMessage: () => { /* noop */ } } as any },
    syncClocks: { big: 1 },
    instanceId: "test",
    updatedAt: new Date().toISOString(),
    data: { huge: "x".repeat(1024) },
    hashState,
    reportStoreError: (_name, message) => captured.push(message),
  });

  assert.ok(captured.some((msg) => /payload/i.test(msg)));
  configureStroid({
    logSink: {
      warn: (msg: string) => { if (typeof console !== "undefined" && console.warn) console.warn(msg); },
      critical: (msg: string) => { if (typeof console !== "undefined" && console.error) console.error(msg); },
    },
  });
});
