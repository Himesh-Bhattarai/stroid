import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createComputed } from "../src/computed/index.js";
import {
  applyStorePatch,
  evaluateComputed,
  getComputedDescriptor,
  getStoreSnapshot,
  getTimingContract,
  subscribeStore,
} from "../src/psr/index.js";
import { createStore } from "../src/store.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import {
  emitReport,
  flushRuntime,
  isMainModule,
  round,
  summarizeSamples,
} from "./benchmark-guarantee-utils.js";

type QuoteState = {
  qty: number;
  unitPrice: number;
  discount: number;
  limit: number;
};

const PROPOSALS: readonly QuoteState[] = [
  { qty: 2, unitPrice: 25, discount: 5, limit: 100 },
  { qty: 3, unitPrice: 30, discount: 0, limit: 100 },
  { qty: 5, unitPrice: 25, discount: 0, limit: 100 },
  { qty: 4, unitPrice: 20, discount: 10, limit: 100 },
  { qty: 2, unitPrice: 40, discount: 60, limit: 100 },
];

export const runGovernanceLifecycleBenchmark = async () => {
  resetAllStoresForTest();

  createStore("governanceQuote", {
    qty: 1,
    unitPrice: 20,
    discount: 0,
    limit: 100,
  });
  createComputed(
    "governanceTotal",
    ["governanceQuote"],
    (quote) => {
      const current = quote as QuoteState | null;
      if (!current) return 0;
      return (current.qty * current.unitPrice) - current.discount;
    },
    { classification: "deterministic" },
  );

  const contract = getTimingContract("governanceTotal");
  assert.equal(contract.governanceMode, "full-governor");
  assert.equal(contract.executionModel, "sync");
  assert.deepEqual(contract.reasons, []);

  const descriptor = getComputedDescriptor("governanceTotal");
  assert.ok(descriptor, "Missing deterministic descriptor for governanceTotal");

  const committedTotals: number[] = [];
  const previewDurations: number[] = [];
  const commitDurations: number[] = [];
  let previewCommitMismatchCount = 0;
  let rejectedMutationCount = 0;

  const off = subscribeStore("governanceTotal", (snapshot) => {
    if (typeof snapshot === "number") {
      committedTotals.push(snapshot);
    }
  });

  try {
    for (let index = 0; index < PROPOSALS.length; index += 1) {
      const proposal = PROPOSALS[index]!;
      const beforeQuote = getStoreSnapshot("governanceQuote") as QuoteState;
      const beforeTotal = getStoreSnapshot("governanceTotal");
      const beforeCommittedCount = committedTotals.length;

      const previewStart = performance.now();
      const preview = evaluateComputed(descriptor.id, {
        governanceQuote: proposal,
      });
      previewDurations.push(round(performance.now() - previewStart));
      assert.equal(typeof preview, "number");

      const allowed = (preview as number) >= 0 && (preview as number) <= proposal.limit;
      if (!allowed) {
        rejectedMutationCount += 1;
        await flushRuntime();
        assert.deepEqual(getStoreSnapshot("governanceQuote"), beforeQuote);
        assert.equal(getStoreSnapshot("governanceTotal"), beforeTotal);
        assert.equal(committedTotals.length, beforeCommittedCount);
        continue;
      }

      const commitStart = performance.now();
      const result = applyStorePatch({
        id: `governance-${index + 1}`,
        store: "governanceQuote",
        path: [],
        op: "set",
        value: proposal,
        meta: {
          timestamp: index + 1,
          source: "setStore",
        },
      });
      commitDurations.push(round(performance.now() - commitStart));

      assert.deepEqual(result, { ok: true });

      await flushRuntime();

      const committedQuote = getStoreSnapshot("governanceQuote");
      const committedTotal = getStoreSnapshot("governanceTotal");
      if (committedTotal !== preview) {
        previewCommitMismatchCount += 1;
      }

      assert.deepEqual(committedQuote, proposal);
      assert.equal(committedTotal, preview);
      assert.equal(committedTotals.at(-1), preview);
    }
  } finally {
    off();
  }

  assert.equal(previewCommitMismatchCount, 0, "Preview diverged from the committed computed value");

  return {
    name: "Governance Lifecycle Test",
    proposals: PROPOSALS.length,
    rejectedMutationCount,
    previewCommitMismatchCount,
    timingContract: contract,
    previewTiming: summarizeSamples(previewDurations),
    commitTiming: summarizeSamples(commitDurations),
    committedTotals,
  };
};

const main = async () => {
  const result = await runGovernanceLifecycleBenchmark();
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
