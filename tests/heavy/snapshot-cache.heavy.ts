/**
 * @fileoverview tests\heavy\snapshot-cache.heavy.ts
 */
import assert from "node:assert";
import test from "node:test";

const now = (): number =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();

test("heavy snapshot cache benchmark (update + notify + snapshot read)", async () => {
  const store = await import(`../../src/store.js?snapshot-cache-heavy-${Date.now()}`);

  const big = Array.from({ length: 20_000 }, (_, i) => i);
  store.clearAllStores();
  store.createStore("bigSnapshot", { counter: 0, data: big });

  let reads = 0;
  store._subscribe("bigSnapshot", () => {
    store._getSnapshot("bigSnapshot");
    reads += 1;
  });

  const iterations = 100;
  const start = now();
  for (let i = 0; i < iterations; i++) {
    store.setStore("bigSnapshot", "counter", i);
    // allow the queued flush microtask to run
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  const ms = now() - start;

  assert.strictEqual(reads, iterations);
  // eslint-disable-next-line no-console
  console.log(`[snapshot-cache] iterations=${iterations} ms=${ms.toFixed(1)}`);

  store.clearAllStores();
});


