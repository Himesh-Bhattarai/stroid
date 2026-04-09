/**
 * @module tests/regression/concurrent-batch-hardened
 *
 * LAYER: Regression
 * OWNS:  Hard concurrency guarantees for setStoreBatch under mixed queue phases.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createStore, getStore, setStore, setStoreBatch, subscribeStore } from "../../src/store.js";
import { getStoreMeta } from "../../src/runtime-tools/index.js";
import { waitForNotificationIdle } from "../../src/notification/index.js";
import { getRegistry } from "../../src/core/store-lifecycle/registry.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";

test("N concurrent setStoreBatch calls all commit with no silent drops", async () => {
  resetAllStoresForTest();
  createStore("batch-hard-counter", { value: 0 });

  const seen: number[] = [];
  subscribeStore("batch-hard-counter", (snapshot) => {
    if (!snapshot) return;
    seen.push((snapshot as { value: number }).value);
  });

  const writes = 20;
  await Promise.all(
    Array.from({ length: writes }, () =>
      Promise.resolve().then(() => {
        setStoreBatch(() => {
          setStore("batch-hard-counter", (draft: { value: number }) => {
            draft.value += 1;
          });
        });
      })
    )
  );
  await waitForNotificationIdle(getRegistry());

  const final = getStore("batch-hard-counter") as { value: number } | null;
  const updateCount = getStoreMeta("batch-hard-counter")?.updateCount ?? 0;

  assert.strictEqual(final?.value, writes);
  assert.strictEqual(updateCount, writes);
  assert.strictEqual(seen[seen.length - 1], writes);
  assert.ok(
    seen.every((value, index) => index === 0 || value > seen[index - 1]),
    `expected strictly increasing notifications, got [${seen.join(", ")}]`
  );
});

test("setStoreBatch mixes microtask and task queues without value loss or duplicate observations", async () => {
  resetAllStoresForTest();
  createStore("batch-hard-mixed", { value: 0 });

  const seen: number[] = [];
  subscribeStore("batch-hard-mixed", (snapshot) => {
    if (!snapshot) return;
    seen.push((snapshot as { value: number }).value);
  });

  const microtaskWrites = 10;
  const timeoutWrites = 10;
  const microtasks = Array.from({ length: microtaskWrites }, () =>
    Promise.resolve().then(() => {
      setStoreBatch(() => {
        setStore("batch-hard-mixed", (draft: { value: number }) => {
          draft.value += 1;
        });
      });
    })
  );
  const timeouts = Array.from({ length: timeoutWrites }, () =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        setStoreBatch(() => {
          setStore("batch-hard-mixed", (draft: { value: number }) => {
            draft.value += 1;
          });
        });
        resolve();
      }, 0);
    })
  );

  await Promise.all([...microtasks, ...timeouts]);
  await waitForNotificationIdle(getRegistry());

  const expected = microtaskWrites + timeoutWrites;
  const final = getStore("batch-hard-mixed") as { value: number } | null;
  const uniqueSeenCount = new Set(seen).size;

  assert.strictEqual(final?.value, expected);
  assert.strictEqual(seen[seen.length - 1], expected);
  assert.strictEqual(uniqueSeenCount, seen.length);
  assert.ok(
    seen.every((value, index) => index === 0 || value > seen[index - 1]),
    `expected strictly increasing notifications, got [${seen.join(", ")}]`
  );
});
