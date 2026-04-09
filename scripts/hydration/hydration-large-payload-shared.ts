import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import { getHydrationDriftMetrics } from "../../src/runtime-tools/index.js";
import { createStore, getStore, hydrateStores, setStore } from "../../src/store.js";
import { deepClone } from "../../src/utils.js";

export type LargePayloadBlock = {
  id: string;
  text: string;
  metrics: number[];
  flags: {
    hot: boolean;
    cold: boolean;
  };
};

export type LargePayloadState = {
  meta: {
    label: string;
    revision: number;
    blockCount: number;
    approxBytes: number;
  };
  blocks: LargePayloadBlock[];
  summary: {
    touched: string[];
    lastWriteSource: string;
  };
};

export type LargePayloadScenarioResult = {
  targetKb: number;
  queued: boolean;
  approximateBytes: number;
  finalState: LargePayloadState | null;
  driftEvents: number;
  queuedWrites: number;
  replayedWrites: number;
};

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

export const estimateBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

const ESTIMATED_BLOCK_OVERHEAD_BYTES = 1;

const createPayloadBlock = (index: number): LargePayloadBlock => ({
  id: `block-${index}`,
  text: `chunk-${index}-${"x".repeat(448)}`,
  metrics: [index, index + 1, index + 2, index + 3],
  flags: {
    hot: index % 2 === 0,
    cold: index % 3 === 0,
  },
});

const createPayloadStateShell = (targetKb: number, blocks: LargePayloadBlock[]): LargePayloadState => ({
  meta: {
    label: `payload-${targetKb}kb`,
    revision: 0,
    blockCount: blocks.length,
    approxBytes: 0,
  },
  blocks,
  summary: {
    touched: [],
    lastWriteSource: "hydrate",
  },
});

const appendBlocks = (blocks: LargePayloadBlock[], count: number): void => {
  for (let index = 0; index < count; index += 1) {
    blocks.push(createPayloadBlock(blocks.length));
  }
};

export const createLargePayloadState = (targetKb: number): LargePayloadState => {
  const targetBytes = targetKb * 1024;
  const blocks: LargePayloadBlock[] = [];
  const emptyState = createPayloadStateShell(targetKb, blocks);
  const emptyStateBytes = estimateBytes(emptyState);
  if (targetBytes <= emptyStateBytes) {
    emptyState.meta.approxBytes = emptyStateBytes;
    return emptyState;
  }

  const sampleBlockBytes = Math.max(1, estimateBytes(createPayloadBlock(0)));
  const estimatedPerBlockBytes = sampleBlockBytes + ESTIMATED_BLOCK_OVERHEAD_BYTES;
  const initialBlockCount = Math.max(
    1,
    Math.ceil((targetBytes - emptyStateBytes) / estimatedPerBlockBytes),
  );

  appendBlocks(blocks, initialBlockCount);

  let state = createPayloadStateShell(targetKb, blocks);
  let measuredBytes = estimateBytes(state);

  while (measuredBytes < targetBytes) {
    const remainingBytes = targetBytes - measuredBytes;
    const extraBlocks = Math.max(1, Math.ceil(remainingBytes / estimatedPerBlockBytes));
    appendBlocks(blocks, extraBlocks);
    state = createPayloadStateShell(targetKb, blocks);
    measuredBytes = estimateBytes(state);
  }

  state.meta.approxBytes = measuredBytes;
  return state;
};

const applyQueuedWrites = async (): Promise<void> => {
  setStore("largePayload", (draft: LargePayloadState) => {
    draft.meta.revision += 1;
    draft.summary.lastWriteSource = "effect:first";
    draft.summary.touched = [...draft.summary.touched, draft.blocks[0]?.id ?? "none"].slice(-8);
  });

  await Promise.resolve();

  setStore("largePayload", (draft: LargePayloadState) => {
    const middleIndex = Math.floor(draft.blocks.length / 2);
    const middle = draft.blocks[middleIndex];
    if (middle) {
      middle.flags.hot = !middle.flags.hot;
      middle.metrics[0] = middle.metrics[0] + 1;
      draft.summary.touched = [...draft.summary.touched, middle.id].slice(-8);
    }
    draft.summary.lastWriteSource = "effect:middle";
  });

  await wait(0);

  setStore("largePayload", (draft: LargePayloadState) => {
    const last = draft.blocks[draft.blocks.length - 1];
    if (last) {
      last.flags.cold = !last.flags.cold;
      last.text = `${last.text}|tail`;
      draft.summary.touched = [...draft.summary.touched, last.id].slice(-8);
    }
    draft.meta.revision += 1;
    draft.summary.lastWriteSource = "effect:last";
  });
};

const settleAfterClose = async (): Promise<void> => {
  await wait(0);
  await wait(0);
};

export const runLargePayloadScenario = async (args: {
  targetKb: number;
  queued: boolean;
  baseline?: LargePayloadState;
}): Promise<LargePayloadScenarioResult> => {
  resetAllStoresForTest();
  const baseline = args.baseline ?? createLargePayloadState(args.targetKb);
  const initialState = deepClone(baseline);
  createStore("largePayload", initialState);

  const hydration = hydrateStores(
    { largePayload: deepClone(baseline) },
    {},
    { allowTrusted: true },
    {
      ...(args.queued ? { bootWindow: { mode: "manual" as const } } : {}),
      policyMap: {
        largePayload: "client_wins",
      },
    },
  );

  await applyQueuedWrites();

  if (args.queued) {
    hydration.bootWindow?.close();
    await settleAfterClose();
  }

  const metrics = getHydrationDriftMetrics();

  return {
    targetKb: args.targetKb,
    queued: args.queued,
    approximateBytes: baseline.meta.approxBytes,
    finalState: getStore("largePayload") as LargePayloadState | null,
    driftEvents: metrics.driftEvents,
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
  };
};
