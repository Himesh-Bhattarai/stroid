import assert from "node:assert";
import { test } from "node:test";
import { fetchStore, refetchStore } from "../src/async.js";
import { clearAllStores, deleteStore } from "../src/store.js";

test("fetchStore metadata is cleared when store is deleted", async () => {
  clearAllStores();

  await fetchStore("asyncStore", Promise.resolve({ value: 1 }), { cacheKey: "v1" });
  const beforeDelete = await refetchStore("asyncStore");
  assert.deepStrictEqual(beforeDelete, { value: 1 });

  deleteStore("asyncStore");
  await new Promise(resolve => setTimeout(resolve, 10));
  const afterDelete = await refetchStore("asyncStore");
  assert.strictEqual(afterDelete, undefined);

  clearAllStores();
});
