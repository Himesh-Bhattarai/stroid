import assert from "node:assert";
import { test } from "node:test";
import { fetchStore, refetchStore } from "../src/async.js";
import { clearAllStores, deleteStore, createStore } from "../src/store.js";

const ensureAsyncStore = (name: string) => {
  createStore(name, {
    data: null,
    loading: false,
    error: null,
    status: "idle",
  });
};

test("fetchStore metadata is cleared when store is deleted", async () => {
  clearAllStores();
  ensureAsyncStore("asyncStore");

  await fetchStore("asyncStore", Promise.resolve({ value: 1 }), { cacheKey: "v1" });
  const beforeDelete = await refetchStore("asyncStore");
  assert.deepStrictEqual(beforeDelete, { value: 1 });

  deleteStore("asyncStore");
  await new Promise(resolve => setTimeout(resolve, 10));
  const afterDelete = await refetchStore("asyncStore");
  assert.strictEqual(afterDelete, undefined);

  clearAllStores();
});
