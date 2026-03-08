import test from "node:test";
import assert from "node:assert";
import { createStore, getStore, hasStore } from "../src/store.js";
import { benchmarkStoreSet, createMockStore, resetAllStoresForTest, withMockedTime } from "../src/testing.js";

test("resetAllStoresForTest clears registries without firing delete hooks", () => {
  let deletes = 0;

  createStore("testReset", { value: 1 }, {
    onDelete: () => {
      deletes += 1;
    },
  });

  resetAllStoresForTest();

  assert.strictEqual(hasStore("testReset"), false);
  assert.strictEqual(deletes, 0);
});

test("createMockStore proxies set, reset, and use helpers", () => {
  resetAllStoresForTest();
  const mock = createMockStore("mockUser", { value: 1, nested: { color: "blue" } });

  assert.strictEqual(mock.use().name, "mockUser");
  assert.deepStrictEqual(getStore("mockUser"), { value: 1, nested: { color: "blue" } });

  mock.set({ value: 2 });
  assert.deepStrictEqual(getStore("mockUser"), { value: 2, nested: { color: "blue" } });

  mock.set((draft: any) => {
    draft.nested.color = "green";
  });
  assert.deepStrictEqual(getStore("mockUser"), { value: 2, nested: { color: "green" } });

  mock.reset();
  assert.deepStrictEqual(getStore("mockUser"), { value: 1, nested: { color: "blue" } });
});

test("withMockedTime restores Date.now even when the callback throws", () => {
  const realNow = Date.now;

  assert.throws(() => {
    withMockedTime(12345, () => {
      assert.strictEqual(Date.now(), 12345);
      throw new Error("boom");
    });
  }, /boom/);

  assert.strictEqual(Date.now, realNow);
});

test("benchmarkStoreSet returns stable structure and respects iteration count", () => {
  resetAllStoresForTest();
  createStore("benchStore", { value: 0 });

  const result = benchmarkStoreSet("benchStore", 5, (i) => ({ value: i }));

  assert.strictEqual(result.iterations, 5);
  assert.ok(Number.isFinite(result.totalMs));
  assert.ok(Number.isFinite(result.avgMs));
  assert.ok(result.totalMs >= 0);
  assert.ok(result.avgMs >= 0);
  assert.deepStrictEqual(getStore("benchStore"), { value: 4 });
});
