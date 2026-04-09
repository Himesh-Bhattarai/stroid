/**
 * @module tests/regression/async-flush-ordering
 *
 * LAYER: Regression
 * OWNS:  Notification ordering and atomicity during flush delivery.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  getStore,
  setStore,
  setStoreBatch,
  subscribeStore,
} from "../../src/store.js";
import { waitForNotificationIdle } from "../../src/notification/index.js";
import { getRegistry } from "../../src/core/store-lifecycle/registry.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("async flush ordering - subscribers across stores keep registration order", async () => {
  resetAllStoresForTest();
  createStore("order-store-1", { value: 0 });
  createStore("order-store-2", { value: 0 });
  createStore("order-store-3", { value: 0 });

  const calls: string[] = [];
  const off1 = subscribeStore("order-store-1", () => calls.push("sub1"));
  const off2 = subscribeStore("order-store-2", () => calls.push("sub2"));
  const off3 = subscribeStore("order-store-3", () => calls.push("sub3"));

  setStoreBatch(() => {
    setStore("order-store-1", { value: 1 });
    setStore("order-store-2", { value: 2 });
    setStore("order-store-3", { value: 3 });
  });
  await waitForNotificationIdle(getRegistry());

  off1();
  off2();
  off3();

  assert.deepEqual(calls, ["sub1", "sub2", "sub3"]);
});

test("async flush ordering - same-store subscribers run FIFO", async () => {
  resetAllStoresForTest();
  createStore("order-multi-sub", { value: 0 });

  const calls: string[] = [];
  const off1 = subscribeStore("order-multi-sub", () => calls.push("sub1"));
  const off2 = subscribeStore("order-multi-sub", () => calls.push("sub2"));
  const off3 = subscribeStore("order-multi-sub", () => calls.push("sub3"));

  setStore("order-multi-sub", { value: 1 });
  await waitForNotificationIdle(getRegistry());

  off1();
  off2();
  off3();

  assert.deepEqual(calls, ["sub1", "sub2", "sub3"]);
});

test("async flush ordering - sequential updates preserve chronological values", async () => {
  resetAllStoresForTest();
  createStore("order-sequential", { value: 0 });

  const seen: number[] = [];
  subscribeStore("order-sequential", (snapshot) => {
    seen.push((snapshot as { value: number }).value);
  });

  setStore("order-sequential", { value: 1 });
  await waitForNotificationIdle(getRegistry());
  setStore("order-sequential", { value: 2 });
  await waitForNotificationIdle(getRegistry());
  setStore("order-sequential", { value: 3 });
  await waitForNotificationIdle(getRegistry());

  assert.deepEqual(seen, [1, 2, 3]);
});

test("async flush ordering - batch notifications are atomic across sibling stores", async () => {
  resetAllStoresForTest();
  createStore("atomic-1", { value: 0 });
  createStore("atomic-2", { value: 0 });

  const snapshots: Array<{ val1: number; val2: number }> = [];
  const capture = (): void => {
    const one = getStore("atomic-1") as { value: number } | null;
    const two = getStore("atomic-2") as { value: number } | null;
    snapshots.push({
      val1: one?.value ?? 0,
      val2: two?.value ?? 0,
    });
  };

  subscribeStore("atomic-1", capture);
  subscribeStore("atomic-2", capture);

  setStoreBatch(() => {
    setStore("atomic-1", { value: 10 });
    setStore("atomic-2", { value: 20 });
  });
  await waitForNotificationIdle(getRegistry());

  assert.ok(snapshots.length >= 2, "expected both subscribers to observe the batch");
  snapshots.forEach((snapshot, index) => {
    assert.deepEqual(
      snapshot,
      { val1: 10, val2: 20 },
      `expected fully updated snapshot at index ${index}, received ${JSON.stringify(snapshot)}`
    );
  });
});
