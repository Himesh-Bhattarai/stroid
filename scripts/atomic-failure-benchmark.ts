import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  createStore,
  getStore,
  hasStore,
  hydrateStores,
  setStore,
  setStoreBatch,
  subscribe,
} from "../src/store.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  round,
  summarizeSamples,
} from "./benchmark-guarantee-utils.js";

type InventoryState = {
  available: number;
  reserved: number;
};

type LedgerState = {
  committed: number;
  lastOrder: number | null;
};

type OutboxState = {
  messages: string[];
};

type FailureMode = "throw" | "create" | "hydrate" | "success";

const ITERATIONS = 48;
const MODES: readonly FailureMode[] = ["throw", "create", "hydrate", "success"];

export const runAtomicFailureBenchmark = async () => {
  resetAllStoresForTest();

  createStore("atomicInventory", { available: 96, reserved: 0 });
  createStore("atomicLedger", { committed: 0, lastOrder: null });
  createStore("atomicOutbox", { messages: [] as string[] });

  const seen = {
    inventory: [] as InventoryState[],
    ledger: [] as LedgerState[],
    outbox: [] as OutboxState[],
  };

  const offInventory = subscribe("atomicInventory", (snapshot) => {
    if (snapshot) seen.inventory.push(snapshot as InventoryState);
  });
  const offLedger = subscribe("atomicLedger", (snapshot) => {
    if (snapshot) seen.ledger.push(snapshot as LedgerState);
  });
  const offOutbox = subscribe("atomicOutbox", (snapshot) => {
    if (snapshot) seen.outbox.push(snapshot as OutboxState);
  });

  const durations: number[] = [];
  let rollbackCount = 0;
  let partialCommitCount = 0;

  const expected = {
    inventory: { available: 96, reserved: 0 },
    ledger: { committed: 0, lastOrder: null as number | null },
    outbox: { messages: [] as string[] },
  };

  try {
    for (let index = 0; index < ITERATIONS; index += 1) {
      const orderId = index + 1;
      const mode = MODES[index % MODES.length];

      const before = {
        inventory: getStore("atomicInventory") as InventoryState,
        ledger: getStore("atomicLedger") as LedgerState,
        outbox: getStore("atomicOutbox") as OutboxState,
        seenInventory: seen.inventory.length,
        seenLedger: seen.ledger.length,
        seenOutbox: seen.outbox.length,
      };

      const startedAt = performance.now();
      setStoreBatch(() => {
        setStore("atomicInventory", (draft: InventoryState) => {
          draft.available -= 1;
          draft.reserved += 1;
        });
        setStore("atomicLedger", (draft: LedgerState) => {
          draft.committed += 1;
          draft.lastOrder = orderId;
        });

        if (mode === "throw") {
          throw new Error(`rollback-${orderId}`);
        }

        if (mode === "create") {
          createStore(`atomicUnexpected-${orderId}`, { orderId });
          return;
        }

        if (mode === "hydrate") {
          hydrateStores(
            { [`atomicHydrated-${orderId}`]: { orderId } },
            {},
            { allowTrusted: true },
          );
          return;
        }

        setStore("atomicOutbox", (draft: OutboxState) => {
          draft.messages.push(`order-${orderId}`);
        });
      });
      durations.push(round(performance.now() - startedAt));
      await flushRuntime();

      if (mode === "success") {
        expected.inventory = {
          available: expected.inventory.available - 1,
          reserved: expected.inventory.reserved + 1,
        };
        expected.ledger = {
          committed: expected.ledger.committed + 1,
          lastOrder: orderId,
        };
        expected.outbox = {
          messages: [...expected.outbox.messages, `order-${orderId}`],
        };

        assert.deepEqual(getStore("atomicInventory"), expected.inventory);
        assert.deepEqual(getStore("atomicLedger"), expected.ledger);
        assert.deepEqual(getStore("atomicOutbox"), expected.outbox);
        assert.equal(seen.inventory.length, before.seenInventory + 1);
        assert.equal(seen.ledger.length, before.seenLedger + 1);
        assert.equal(seen.outbox.length, before.seenOutbox + 1);
        continue;
      }

      rollbackCount += 1;

      const afterInventory = getStore("atomicInventory") as InventoryState;
      const afterLedger = getStore("atomicLedger") as LedgerState;
      const afterOutbox = getStore("atomicOutbox") as OutboxState;

      if (
        JSON.stringify(afterInventory) !== JSON.stringify(before.inventory)
        || JSON.stringify(afterLedger) !== JSON.stringify(before.ledger)
        || JSON.stringify(afterOutbox) !== JSON.stringify(before.outbox)
      ) {
        partialCommitCount += 1;
      }

      assert.deepEqual(afterInventory, before.inventory);
      assert.deepEqual(afterLedger, before.ledger);
      assert.deepEqual(afterOutbox, before.outbox);
      assert.equal(seen.inventory.length, before.seenInventory);
      assert.equal(seen.ledger.length, before.seenLedger);
      assert.equal(seen.outbox.length, before.seenOutbox);
      assert.equal(hasStore(`atomicUnexpected-${orderId}`), false);
      assert.equal(hasStore(`atomicHydrated-${orderId}`), false);
    }
  } finally {
    offInventory();
    offLedger();
    offOutbox();
  }

  assert.equal(partialCommitCount, 0, "A failed batch leaked partial state");

  return {
    name: "Atomic Failure Injection Test",
    iterations: ITERATIONS,
    rollbackCount,
    partialCommitCount,
    timing: summarizeSamples(durations),
    finalState: {
      inventory: getStore("atomicInventory"),
      ledger: getStore("atomicLedger"),
      outbox: getStore("atomicOutbox"),
    },
  };
};

const main = async () => {
  const result = await runAtomicFailureBenchmark();
  emitReport({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    result,
  });
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
