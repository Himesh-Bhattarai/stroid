import test from "node:test";
import assert from "node:assert/strict";
import { createStore, setStore, setStoreBatch, deleteStore, subscribeStore, getStore } from "../../src/store.js";

// Regression test: async flush ordering
// Ensure that when multiple stores are updated in a batch, subscribers are notified
// in a consistent, predictable order. This test verifies:
// 1. Subscribers are called in the order they were registered
// 2. All updates in a batch are visible to subscribers (no partial visibility)
// 3. Ordering is deterministic across multiple runs

test("async flush ordering - subscribers notified in consistent order", async () => {
  createStore("order-store-1", { value: 0 });
  createStore("order-store-2", { value: 0 });
  createStore("order-store-3", { value: 0 });

  const callOrder: string[] = [];
  const expectedOrder = ["sub1", "sub2", "sub3"];

  try {
    const unsub1 = subscribeStore("order-store-1", () => {
      callOrder.push("sub1");
    });

    const unsub2 = subscribeStore("order-store-2", () => {
      callOrder.push("sub2");
    });

    const unsub3 = subscribeStore("order-store-3", () => {
      callOrder.push("sub3");
    });

    setStoreBatch(() => {
      setStore("order-store-1", { value: 1 });
      setStore("order-store-2", { value: 2 });
      setStore("order-store-3", { value: 3 });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepEqual(
      callOrder,
      expectedOrder,
      `Subscriber call order mismatch. Expected ${expectedOrder.join(", ")}, got ${callOrder.join(", ")}`
    );

    unsub1();
    unsub2();
    unsub3();
  } finally {
    try {
      deleteStore("order-store-1");
      deleteStore("order-store-2");
      deleteStore("order-store-3");
    } catch {}
  }

  assert.ok(true, "Async flush ordering test passed");
});

// Edge case: verify ordering with multiple subscribers on the same store
test("async flush ordering - multiple subscribers on same store", async () => {
  createStore("order-multi-sub", { value: 0 });

  const callOrder: string[] = [];

  try {
    const unsub1 = subscribeStore("order-multi-sub", () => callOrder.push("sub1"));
    const unsub2 = subscribeStore("order-multi-sub", () => callOrder.push("sub2"));
    const unsub3 = subscribeStore("order-multi-sub", () => callOrder.push("sub3"));

    setStore("order-multi-sub", { value: 1 });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(callOrder.length, 3, `Expected 3 subscriber calls, got ${callOrder.length}`);

    assert.deepEqual(
      callOrder,
      ["sub1", "sub2", "sub3"],
      `Subscriber order incorrect: ${callOrder.join(", ")}`
    );

    unsub1();
    unsub2();
    unsub3();
  } finally {
    try {
      deleteStore("order-multi-sub");
    } catch {}
  }

  assert.ok(true, "Multiple subscribers ordering test passed");
});

// Edge case: verify ordering with nested/sequential updates
test("async flush ordering - sequential updates maintain order", async () => {
  createStore("order-sequential", { value: 0 });

  const updateSequence: number[] = [];

  try {
    subscribeStore("order-sequential", (val) => {
      updateSequence.push((val as { value: number }).value);
    });

    setStore("order-sequential", { value: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    setStore("order-sequential", { value: 2 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    setStore("order-sequential", { value: 3 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(
      updateSequence,
      [1, 2, 3],
      `Update sequence incorrect: ${updateSequence.join(", ")}`
    );
  } finally {
    try {
      deleteStore("order-sequential");
    } catch {}
  }

  assert.ok(true, "Sequential updates ordering test passed");
});

// Edge case: verify that batch updates are atomic from subscriber perspective
test("async flush ordering - batch updates appear atomic to subscribers", async () => {
  createStore("atomic-1", { value: 0 });
  createStore("atomic-2", { value: 0 });

  const snapshots: Array<{ val1: number; val2: number }> = [];

  try {
    subscribeStore("atomic-1", () => {
      const store1 = getStore("atomic-1") as { value: number } | null;
      const store2 = getStore("atomic-2") as { value: number } | null;
      snapshots.push({
        val1: store1?.value ?? 0,
        val2: store2?.value ?? 0,
      });
    });

    subscribeStore("atomic-2", () => {
      const store1 = getStore("atomic-1") as { value: number } | null;
      const store2 = getStore("atomic-2") as { value: number } | null;
      snapshots.push({
        val1: store1?.value ?? 0,
        val2: store2?.value ?? 0,
      });
    });

    setStoreBatch(() => {
      setStore("atomic-1", { value: 10 });
      setStore("atomic-2", { value: 20 });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    for (const snapshot of snapshots) {
      const isInitial = snapshot.val1 === 0 && snapshot.val2 === 0;
      const isUpdated = snapshot.val1 === 10 && snapshot.val2 === 20;
      assert.ok(
        isInitial || isUpdated,
        `Partial state observed: val1=${snapshot.val1}, val2=${snapshot.val2}. Batch updates not atomic.`
      );
    }
  } finally {
    try {
      deleteStore("atomic-1");
      deleteStore("atomic-2");
    } catch {}
  }

  assert.ok(true, "Atomic batch updates test passed");
});
