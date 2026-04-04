import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createComputed, deleteComputed } from "../../src/computed/index.js";
import { getComputedDescriptor, getStoreSnapshot, subscribeStore, evaluateComputed } from "../../src/psr/index.js";
import { createStore, getStore, setStore, setStoreBatch } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  round,
  summarizeSamples,
} from "./benchmark-guarantee-utils.js";

type CartState = {
  items: Array<{ sku: string; qty: number; price: number }>;
  shipping: number;
};

type DiscountState = {
  amount: number;
};

const REPLAYS = 20;

const applyScenario = async (): Promise<string> => {
  createStore("detCart", {
    items: [{ sku: "A", qty: 1, price: 10 }],
    shipping: 2,
  });
  createStore("detDiscount", { amount: 0 });

  createComputed(
    "detLineCount",
    ["detCart"],
    (cart) => ((cart as CartState | null)?.items ?? []).reduce((sum, item) => sum + item.qty, 0),
    { classification: "deterministic" },
  );
  createComputed(
    "detSubtotal",
    ["detCart"],
    (cart) => ((cart as CartState | null)?.items ?? []).reduce((sum, item) => sum + (item.qty * item.price), 0),
    { classification: "deterministic" },
  );
  createComputed(
    "detGrandTotal",
    ["detCart", "detSubtotal", "detDiscount"],
    (cart, subtotal, discount) => (
      ((subtotal as number | null) ?? 0)
      + ((cart as CartState | null)?.shipping ?? 0)
      - ((discount as DiscountState | null)?.amount ?? 0)
    ),
    { classification: "deterministic" },
  );

  const transcript: string[] = [];
  const offCart = subscribeStore("detCart", (snapshot) => {
    transcript.push(`detCart:${JSON.stringify(snapshot)}`);
  });
  const offLineCount = subscribeStore("detLineCount", (snapshot) => {
    transcript.push(`detLineCount:${JSON.stringify(snapshot)}`);
  });
  const offSubtotal = subscribeStore("detSubtotal", (snapshot) => {
    transcript.push(`detSubtotal:${JSON.stringify(snapshot)}`);
  });
  const offGrandTotal = subscribeStore("detGrandTotal", (snapshot) => {
    transcript.push(`detGrandTotal:${JSON.stringify(snapshot)}`);
  });

  try {
    setStoreBatch(() => {
      setStore("detCart", (draft: CartState) => {
        draft.items[0]!.qty = 2;
      });
      setStore("detDiscount", { amount: 1 });
    });
    await flushRuntime();

    setStore("detCart", (draft: CartState) => {
      draft.items.push({ sku: "B", qty: 3, price: 4 });
    });
    await flushRuntime();

    setStoreBatch(() => {
      setStore("detCart", (draft: CartState) => {
        draft.shipping = 5;
        const second = draft.items.find((item) => item.sku === "B");
        if (second) second.qty = 1;
      });
      setStore("detDiscount", { amount: 2 });
    });
    await flushRuntime();

    setStore("detCart", (draft: CartState) => {
      draft.items = draft.items.filter((item) => item.sku !== "A");
    });
    await flushRuntime();

    setStore("detDiscount", { amount: 0 });
    await flushRuntime();

    const descriptor = getComputedDescriptor("detGrandTotal");
    assert.ok(descriptor, "Missing deterministic descriptor for detGrandTotal");

    const cart = getStore("detCart") as CartState;
    const discount = getStore("detDiscount") as DiscountState;
    const lineCount = getStore("detLineCount");
    const subtotal = getStore("detSubtotal");
    const grandTotal = getStore("detGrandTotal");
    const preview = evaluateComputed(descriptor.id, {
      detCart: cart,
      detDiscount: discount,
    });

    assert.equal(preview, grandTotal);
    assert.equal(getStoreSnapshot("detGrandTotal"), grandTotal);

    return JSON.stringify({
      cart,
      discount,
      lineCount,
      subtotal,
      grandTotal,
      transcript,
    });
  } finally {
    offCart();
    offLineCount();
    offSubtotal();
    offGrandTotal();
    deleteComputed("detGrandTotal");
    deleteComputed("detSubtotal");
    deleteComputed("detLineCount");
  }
};

export const runDeterminismReplayBenchmark = async () => {
  const signatures = new Set<string>();
  const durations: number[] = [];

  for (let replay = 0; replay < REPLAYS; replay += 1) {
    resetAllStoresForTest();

    const startedAt = performance.now();
    const signature = await applyScenario();
    durations.push(round(performance.now() - startedAt));
    signatures.add(signature);
  }

  assert.equal(signatures.size, 1, `Replay diverged across runs (${signatures.size} unique outputs)`);

  return {
    name: "Determinism Replay Test",
    replays: REPLAYS,
    uniqueOutputCount: signatures.size,
    timing: summarizeSamples(durations),
  };
};

const main = async () => {
  const result = await runDeterminismReplayBenchmark();
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
