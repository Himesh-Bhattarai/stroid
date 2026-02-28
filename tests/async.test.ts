import test from "node:test";
import assert from "node:assert";
import { fetchStore } from "../src/async.js";
import { getStore, clearAllStores } from "../src/store.js";

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

test("fetchStore dedupes inflight requests", async () => {
  clearAllStores();
  const realFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    await wait(10);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ value: "deduped" }),
      text: async () => JSON.stringify({ value: "deduped" }),
    } as any;
  }) as typeof fetch;

  try {
    const p1 = fetchStore("dedupeStore", "https://api.example.com/value");
    const p2 = fetchStore("dedupeStore", "https://api.example.com/value");
    const [r1, r2] = await Promise.all([p1, p2]);

    assert.strictEqual(callCount, 1);
    const state = getStore("dedupeStore");
    assert.deepStrictEqual(state?.data, { value: "deduped" });
    assert.deepStrictEqual(r1, r2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchStore uses last-write-wins for racing promises", async () => {
  clearAllStores();

  const slow = new Promise((res) => setTimeout(() => res({ result: "slow" }), 30));
  const fast = new Promise((res) => setTimeout(() => res({ result: "fast" }), 5));

  await Promise.all([
    fetchStore("raceStore", slow, { dedupe: false }),
    fetchStore("raceStore", fast, { dedupe: false }),
  ]);

  const state = getStore("raceStore");
  assert.deepStrictEqual(state?.data, { result: "fast" });
  assert.strictEqual(state?.status, "success");
});
