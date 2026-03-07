import test from "node:test";
import assert from "node:assert";
import { fetchStore } from "../src/async.js";
import { getStore, clearAllStores, deleteStore } from "../src/store.js";

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

test("fetchStore aborts lifecycle-owned requests when the store is deleted", async () => {
  clearAllStores();
  const realFetch = globalThis.fetch;
  let aborted = false;
  let seenSignal: AbortSignal | undefined;

  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    seenSignal = init?.signal as AbortSignal | undefined;
    return new Promise((resolve, reject) => {
      seenSignal?.addEventListener("abort", () => {
        aborted = true;
        const err = new Error("aborted") as Error & { name: string };
        err.name = "AbortError";
        reject(err);
      });

      setTimeout(() => {
        resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: () => "application/json" },
          json: async () => ({ value: "late" }),
          text: async () => JSON.stringify({ value: "late" }),
        } as any);
      }, 50);
    });
  }) as typeof fetch;

  try {
    const request = fetchStore("lifecycledStore", "https://api.example.com/slow");
    await wait(0);
    deleteStore("lifecycledStore");

    const result = await request;
    assert.strictEqual(result, null);
    assert.ok(seenSignal);
    assert.strictEqual(aborted, true);
  } finally {
    globalThis.fetch = realFetch;
    clearAllStores();
  }
});

test("fetchStore keeps success state when onSuccess throws", async () => {
  clearAllStores();

  const result = await fetchStore("callbackSuccessStore", Promise.resolve({ value: "ok" }), {
    dedupe: false,
    onSuccess: () => {
      throw new Error("success hook boom");
    },
  });

  assert.deepStrictEqual(result, { value: "ok" });
  const state = getStore("callbackSuccessStore");
  assert.deepStrictEqual(state?.data, { value: "ok" });
  assert.strictEqual(state?.status, "success");
});

test("fetchStore swallows onError callback throws and returns null", async () => {
  clearAllStores();

  const result = await fetchStore("callbackErrorStore", Promise.reject(new Error("network boom")), {
    dedupe: false,
    onError: () => {
      throw new Error("error hook boom");
    },
  });

  assert.strictEqual(result, null);
  const state = getStore("callbackErrorStore");
  assert.strictEqual(state?.status, "error");
  assert.strictEqual(state?.error, "network boom");
});
