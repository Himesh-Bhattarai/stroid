/**
 * @module tests/integration/core/notify
 *
 * LAYER: Integration
 * OWNS:  Store notification chunking behavior.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { clearAllStores, createStore, setStore } from "../../../src/store.js";
import { configureStroid } from "../../../src/config.js";
import { notify, subscribeStore } from "../../../src/core/store-notify.js";

test("store-notify chunk scheduling and priority queues", async () => {
  clearAllStores();
  configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 5, priorityStores: ["prioStore"] } });
  createStore("prioStore", { value: 1 });
  createStore("otherStore", { value: 1 });
  createStore("noSubs", { value: 1 });

  let bumped = false;
  let threw = false;
  const unsub = subscribeStore("prioStore", () => {
    threw = true;
    if (!bumped) {
      bumped = true;
      setStore("prioStore", "value", 3);
    }
    throw new Error("subscriber boom");
  });
  subscribeStore("otherStore", () => undefined);

  setStore("prioStore", "value", 2);
  setStore("otherStore", "value", 2);
  setStore("noSubs", "value", 2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  unsub();
  assert.ok(threw);

  const originalQueueMicrotask = (globalThis as any).queueMicrotask;
  try {
    (globalThis as any).queueMicrotask = undefined;
    notify("prioStore");
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});

test("chunked notify handles version changes and subscriber removals mid-flush", async () => {
  clearAllStores();
  configureStroid({
    flush: {
      chunkSize: 1,
      chunkDelayMs: 5,
      priorityStores: ["notifyA", "notifyB", "notifyC", "notifyD"],
    },
  });
  createStore("notifyA", { value: 0 });
  createStore("notifyB", { value: 0 });
  createStore("notifyC", { value: 0 });
  createStore("notifyD", { value: 0 });

  let didUpdate = false;
  let unsubB = () => {};
  let unsubC = () => {};
  let unsubD = () => {};

  const unsubA = subscribeStore("notifyA", () => {
    if (didUpdate) return;
    didUpdate = true;
    setStore("notifyA", "value", 1);
    setStore("notifyB", "value", 1);
    unsubC();
  });
  unsubB = subscribeStore("notifyB", () => {});
  unsubC = subscribeStore("notifyC", () => {});
  unsubD = subscribeStore("notifyD", () => {});

  setStore("notifyA", "value", 1);
  setStore("notifyB", "value", 1);
  setStore("notifyC", "value", 1);
  setStore("notifyD", "value", 1);

  await new Promise((resolve) => setTimeout(resolve, 60));

  unsubA();
  unsubB();
  unsubC();
  unsubD();
  assert.ok(didUpdate);
});
