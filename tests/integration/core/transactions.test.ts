/**
 * @module tests/integration/core/transactions
 *
 * LAYER: Integration
 * OWNS:  Dedicated transaction isolation tests (request-scoped + async-context scoped).
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createStoreForRequest } from "../../../src/server/index.js";
import { createStore, getStore, setStore, setStoreBatch } from "../../../src/store.js";
import { resetAllStoresForTest } from "../../../src/helpers/testing.js";
import { createStoreRegistry, createTransactionState, runWithRegistry } from "../../../src/core/store-registry.js";
import {
  beginTransaction,
  endTransaction,
  getStagedTransactionValue,
  injectTransactionRunner,
  stageTransactionValue,
} from "../../../src/core/store-transaction.js";

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

test("transaction state remains registry-scoped across overlapping request registries", async () => {
  resetAllStoresForTest();

  const reqA = createStoreForRequest((api) => {
    api.create("txRequest", { value: 0 });
  });
  const reqB = createStoreForRequest((api) => {
    api.create("txRequest", { value: 100 });
  });

  const [resultA, resultB] = await Promise.all([
    reqA.hydrate(async () => {
      await wait(10);
      setStoreBatch(() => {
        setStore("txRequest", { value: 1 });
      });
      return getStore("txRequest");
    }),
    reqB.hydrate(async () => {
      setStoreBatch(() => {
        setStore("txRequest", { value: 200 });
      });
      await wait(5);
      return getStore("txRequest");
    }),
  ]);

  assert.deepStrictEqual(resultA, { value: 1 });
  assert.deepStrictEqual(resultB, { value: 200 });
  assert.deepStrictEqual(reqA.snapshot(), { txRequest: { value: 1 } });
  assert.deepStrictEqual(reqB.snapshot(), { txRequest: { value: 200 } });
  assert.strictEqual(getStore("txRequest"), null);
});

test("concurrent async transaction contexts keep staged values isolated on a shared registry", async () => {
  resetAllStoresForTest();

  const txContext = new AsyncLocalStorage<ReturnType<typeof createTransactionState>>();
  injectTransactionRunner({
    run: (state, fn) => txContext.run(state, fn),
    get: () => txContext.getStore() ?? null,
    enterWith: (state) => txContext.enterWith(state),
  });

  try {
    const registry = createStoreRegistry();
    runWithRegistry(registry, () => {
      createStore("txShared", { value: 0 });
    });

    const expectedByCtx: Record<string, number> = Object.create(null);
    const observations: Array<{ ctx: string; value: number }> = [];

    const runContext = (label: string, value: number, delayMs: number): Promise<void> => {
      expectedByCtx[label] = value;
      return new Promise((resolve) => {
        txContext.run(createTransactionState(), () => {
          beginTransaction(registry);
          stageTransactionValue("txShared", { value });

          const first = getStagedTransactionValue("txShared");
          assert.strictEqual(first.has, true);
          observations.push({
            ctx: label,
            value: (first.value as { value: number }).value,
          });

          setTimeout(() => {
            const second = getStagedTransactionValue("txShared");
            assert.strictEqual(second.has, true);
            observations.push({
              ctx: label,
              value: (second.value as { value: number }).value,
            });
            endTransaction(undefined, registry);
            resolve();
          }, delayMs);
        });
      });
    };

    await Promise.all([
      runContext("A", 11, 20),
      runContext("B", 22, 5),
      runContext("C", 33, 12),
      runContext("D", 44, 1),
      runContext("E", 55, 8),
      runContext("F", 66, 3),
      runContext("G", 77, 15),
      runContext("H", 88, 6),
    ]);

    const byCtx = observations.reduce<Record<string, number[]>>((acc, entry) => {
      if (!acc[entry.ctx]) acc[entry.ctx] = [];
      acc[entry.ctx].push(entry.value);
      return acc;
    }, Object.create(null));

    Object.entries(expectedByCtx).forEach(([ctx, expected]) => {
      assert.deepStrictEqual(byCtx[ctx], [expected, expected]);
    });
  } finally {
    injectTransactionRunner(null);
  }
});
