import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createStore, getStore, setStore, setStoreBatch, subscribe } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  round,
  summarizeSamples,
} from "./benchmark-guarantee-utils.js";

type WalletState = {
  available: number;
  reserved: number;
  seq: number;
  credits: number;
};

type OrdersState = {
  open: number;
  settled: number;
  released: number;
};

type ModelState = {
  wallet: WalletState;
  orders: OrdersState;
};

type Operation = "reserve" | "settle" | "release" | "credit";

const WAVES = 24;
const OPS_PER_WAVE = 80;

const createRng = (seed: number) => () => {
  seed = ((seed * 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const cloneState = (state: ModelState): ModelState => ({
  wallet: { ...state.wallet },
  orders: { ...state.orders },
});

const applyModelOperation = (state: ModelState, operation: Operation): void => {
  if (operation === "reserve") {
    state.wallet.available -= 1;
    state.wallet.reserved += 1;
    state.wallet.seq += 1;
    state.orders.open += 1;
    return;
  }

  if (operation === "settle") {
    state.wallet.reserved -= 1;
    state.wallet.seq += 1;
    state.orders.open -= 1;
    state.orders.settled += 1;
    return;
  }

  if (operation === "release") {
    state.wallet.available += 1;
    state.wallet.reserved -= 1;
    state.wallet.seq += 1;
    state.orders.open -= 1;
    state.orders.released += 1;
    return;
  }

  state.wallet.available += 2;
  state.wallet.credits += 2;
  state.wallet.seq += 1;
};

const chooseOperation = (state: ModelState, random: number): Operation => {
  if (state.wallet.reserved > 0 && random < 0.25) return "settle";
  if (state.wallet.reserved > 0 && random < 0.4) return "release";
  if (state.wallet.available > 0 && random < 0.8) return "reserve";
  return "credit";
};

const applyRuntimeOperation = (operation: Operation): void => {
  if (operation === "reserve") {
    setStoreBatch(() => {
      setStore("raceWallet", (draft: WalletState) => {
        draft.available -= 1;
        draft.reserved += 1;
        draft.seq += 1;
      });
      setStore("raceOrders", (draft: OrdersState) => {
        draft.open += 1;
      });
    });
    return;
  }

  if (operation === "settle") {
    setStoreBatch(() => {
      setStore("raceWallet", (draft: WalletState) => {
        draft.reserved -= 1;
        draft.seq += 1;
      });
      setStore("raceOrders", (draft: OrdersState) => {
        draft.open -= 1;
        draft.settled += 1;
      });
    });
    return;
  }

  if (operation === "release") {
    setStoreBatch(() => {
      setStore("raceWallet", (draft: WalletState) => {
        draft.available += 1;
        draft.reserved -= 1;
        draft.seq += 1;
      });
      setStore("raceOrders", (draft: OrdersState) => {
        draft.open -= 1;
        draft.released += 1;
      });
    });
    return;
  }

  setStore("raceWallet", (draft: WalletState) => {
    draft.available += 2;
    draft.credits += 2;
    draft.seq += 1;
  });
};

export const runRaceConditionBenchmark = async () => {
  resetAllStoresForTest();

  createStore("raceWallet", {
    available: 40,
    reserved: 0,
    seq: 0,
    credits: 0,
  });
  createStore("raceOrders", {
    open: 0,
    settled: 0,
    released: 0,
  });

  const rng = createRng(0x5eed1234);
  const durations: number[] = [];
  let invariantViolations = 0;
  let stateMismatchCount = 0;
  let currentWave = 0;

  const checkInvariant = () => {
    const wallet = getStore("raceWallet") as WalletState;
    const orders = getStore("raceOrders") as OrdersState;
    if (!wallet || !orders) return;
    const valid =
      wallet.available >= 0
      && wallet.reserved >= 0
      && orders.open >= 0
      && wallet.reserved === orders.open;
    if (!valid) {
      invariantViolations += 1;
    }
  };

  const offWallet = subscribe("raceWallet", () => {
    checkInvariant();
  });
  const offOrders = subscribe("raceOrders", () => {
    checkInvariant();
  });

  let expected: ModelState = {
    wallet: getStore("raceWallet") as WalletState,
    orders: getStore("raceOrders") as OrdersState,
  };

  try {
    for (let wave = 0; wave < WAVES; wave += 1) {
      currentWave = wave + 1;
      const planned = cloneState(expected);
      const operations: Operation[] = [];

      for (let index = 0; index < OPS_PER_WAVE; index += 1) {
        const operation = chooseOperation(planned, rng());
        operations.push(operation);
        applyModelOperation(planned, operation);
      }

      const startedAt = performance.now();
      await Promise.all(
        operations.map(async (operation, index) => {
          if (index % 2 === 0) {
            await Promise.resolve();
            applyRuntimeOperation(operation);
            return;
          }

          await new Promise<void>((resolve) => {
            queueMicrotask(() => {
              applyRuntimeOperation(operation);
              resolve();
            });
          });
        }),
      );
      durations.push(round(performance.now() - startedAt));

      await flushRuntime();

      const actual = {
        wallet: getStore("raceWallet") as WalletState,
        orders: getStore("raceOrders") as OrdersState,
      };

      if (JSON.stringify(actual) !== JSON.stringify(planned)) {
        stateMismatchCount += 1;
      }

      assert.deepEqual(actual, planned, `Wave ${currentWave} diverged from the deterministic model`);
      expected = planned;
    }
  } finally {
    offWallet();
    offOrders();
  }

  assert.equal(invariantViolations, 0, "A subscriber observed an impossible cross-store state");
  assert.equal(stateMismatchCount, 0, "Race benchmark diverged from the serial reference model");

  return {
    name: "Race Condition Stress Test",
    waves: WAVES,
    operationsPerWave: OPS_PER_WAVE,
    timing: summarizeSamples(durations),
    invariantViolations,
    stateMismatchCount,
    finalState: {
      wallet: getStore("raceWallet"),
      orders: getStore("raceOrders"),
    },
  };
};

const main = async () => {
  const result = await runRaceConditionBenchmark();
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
