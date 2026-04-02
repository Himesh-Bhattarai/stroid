import { applyFeatureState } from "../src/core/store-lifecycle/registry.js";
import { resetAllStoresForTest } from "../src/helpers/testing.ts";
import {
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "../src/runtime-tools/index.js";
import { createStore, getStore, hydrateStores, setStore } from "../src/store.js";

export type RandomizedPolicy = "client_wins" | "server_wins" | "merge";

export type RandomizedState = {
  counter: number;
  nested: {
    server: boolean;
    client: boolean;
    seq: number;
  };
  tags: string[];
  meta: {
    source: string;
    stamp: number;
    merged: boolean;
  };
};

type EffectOperation = {
  kind: "effect";
  index: number;
  delta: number;
};

type FeatureOperation = {
  kind: "feature";
  index: number;
  source: "storage" | "sync" | "network";
  value: RandomizedState;
};

export type RandomizedOperation = EffectOperation | FeatureOperation;

export type RandomizedScenarioResult = {
  seed: number;
  policy: RandomizedPolicy;
  queued: boolean;
  operations: number;
  finalState: RandomizedState | null;
  eventSummary: string[];
  driftEvents: number;
  queuedWrites: number;
  replayedWrites: number;
};

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const createRng = (seed: number) => () => {
  seed = ((seed * 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

export const createBaselineState = (seed: number): RandomizedState => ({
  counter: seed % 7,
  nested: {
    server: true,
    client: false,
    seq: 0,
  },
  tags: [`seed-${seed}`, "server"],
  meta: {
    source: "hydrate",
    stamp: seed,
    merged: false,
  },
});

const dedupeTags = (values: string[]): string[] =>
  Array.from(new Set(values)).slice(-6);

export const randomizedMerge = ({
  baseline,
  live,
}: {
  baseline: RandomizedState;
  live: RandomizedState;
}): RandomizedState => ({
  counter: Math.max(baseline.counter, live.counter),
  nested: {
    server: baseline.nested.server,
    client: live.nested.client,
    seq: Math.max(baseline.nested.seq, live.nested.seq),
  },
  tags: dedupeTags([...baseline.tags, ...live.tags]),
  meta: {
    source: live.meta.source,
    stamp: Math.max(baseline.meta.stamp, live.meta.stamp),
    merged: true,
  },
});

export const buildRandomizedOperations = (
  seed: number,
  steps: number,
): RandomizedOperation[] => {
  const rng = createRng(seed);
  const operations: RandomizedOperation[] = [];

  for (let index = 0; index < steps; index += 1) {
    if (rng() < 0.4) {
      operations.push({
        kind: "effect",
        index,
        delta: 1 + Math.floor(rng() * 3),
      });
      continue;
    }

    const sourceRoll = rng();
    const source = sourceRoll < (1 / 3)
      ? "storage"
      : sourceRoll < (2 / 3)
        ? "sync"
        : "network";
    const stamp = Math.floor(rng() * 10_000) + (index * 31) + seed;
    operations.push({
      kind: "feature",
      index,
      source,
      value: {
        counter: stamp % 257,
        nested: {
          server: index % 2 === 0,
          client: source !== "storage",
          seq: index + 1,
        },
        tags: dedupeTags([
          `seed-${seed}`,
          `step-${index}`,
          source,
          `stamp-${stamp % 17}`,
        ]),
        meta: {
          source,
          stamp,
          merged: false,
        },
      },
    });
  }

  return operations;
};

const crossAsyncBoundary = async (index: number): Promise<void> => {
  const slot = index % 4;
  if (slot === 1) {
    await Promise.resolve();
    return;
  }
  if (slot === 2) {
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    return;
  }
  if (slot === 3) {
    await wait(0);
  }
};

const settleAfterClose = async (): Promise<void> => {
  await wait(0);
  await wait(0);
};

export const runRandomizedHydrationScenario = async (args: {
  seed: number;
  policy: RandomizedPolicy;
  queued: boolean;
  steps: number;
}): Promise<RandomizedScenarioResult> => {
  resetAllStoresForTest();
  const baseline = createBaselineState(args.seed);
  const operations = buildRandomizedOperations(args.seed, args.steps);
  createStore("randomizedState", baseline);

  const hydration = hydrateStores(
    { randomizedState: baseline },
    {},
    { allowTrusted: true },
    {
      ...(args.queued ? { bootWindow: { mode: "manual" as const } } : {}),
      policyMap: {
        randomizedState: args.policy === "merge"
          ? {
              policy: "merge",
              merge: ({ baseline, live }) =>
                randomizedMerge({
                  baseline: baseline as RandomizedState,
                  live: live as RandomizedState,
                }),
            }
          : args.policy,
      },
    },
  );

  for (const operation of operations) {
    if (operation.kind === "effect") {
      setStore("randomizedState", (draft: RandomizedState) => {
        draft.counter += operation.delta;
        draft.nested.client = true;
        draft.nested.seq = operation.index + 1;
        draft.tags = dedupeTags([...draft.tags, `effect-${operation.index}`]);
        draft.meta = {
          source: "effect",
          stamp: draft.meta.stamp + operation.delta,
          merged: draft.meta.merged,
        };
      });
    } else {
      applyFeatureState(
        "randomizedState",
        operation.value,
        operation.index + 1,
        {
          source: operation.source,
          validate: (candidate) => ({
            ok: true,
            value: candidate as RandomizedState,
          }),
        },
      );
    }

    await crossAsyncBoundary(operation.index);
  }

  if (args.queued) {
    hydration.bootWindow?.close();
    await settleAfterClose();
  }

  const metrics = getHydrationDriftMetrics();
  const events = getHydrationDriftEvents(args.steps + 4).map(
    (event) => `${event.source}:${event.resolution}`,
  );

  return {
    seed: args.seed,
    policy: args.policy,
    queued: args.queued,
    operations: operations.length,
    finalState: getStore("randomizedState") as RandomizedState | null,
    eventSummary: events,
    driftEvents: metrics.driftEvents,
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
  };
};
