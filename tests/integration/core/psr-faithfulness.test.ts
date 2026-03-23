/**
 * @module tests/integration/core/psr-faithfulness
 *
 * LAYER: Integration
 * OWNS:  Public-surface PSR faithfulness and contract-lock coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearAllStores } from "../../../src/runtime-admin/index.js";
import { createComputed } from "../../../src/computed/index.js";
import { createStore } from "../../../src/index.js";
import {
  applyStorePatch,
  applyStorePatchesAtomic,
  evaluateComputed,
  getComputedDescriptor,
  getComputedGraph,
  getStoreSnapshot,
  getTimingContract,
  listStores,
  subscribeStore,
  type RuntimePatch,
  type RuntimeNodeId,
} from "../../../src/psr/index.js";

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const flushPublicRuntime = async (ticks = 4): Promise<void> => {
  for (let index = 0; index < ticks; index += 1) {
    await wait();
  }
};

const cloneValue = <T>(value: T): T => structuredClone(value);

const isRecord = (value: unknown): value is Record<string | number, unknown> =>
  typeof value === "object" && value !== null;

const cloneContainer = (value: unknown): Record<string | number, unknown> | unknown[] => {
  if (Array.isArray(value)) return [...value];
  if (isRecord(value)) return { ...value };
  throw new Error("preview patch expected an existing object/array container");
};

const setValueAtPath = (
  root: unknown,
  pathSegments: readonly (string | number)[],
  value: unknown,
): unknown => {
  if (pathSegments.length === 0) return cloneValue(value);
  const nextRoot = cloneContainer(root);
  let targetCursor = nextRoot as Record<string | number, unknown>;
  let sourceCursor = root as Record<string | number, unknown>;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    const sourceChild = sourceCursor?.[segment];
    const nextChild = cloneContainer(sourceChild);
    targetCursor[segment] = nextChild;
    targetCursor = nextChild as Record<string | number, unknown>;
    sourceCursor = sourceChild as Record<string | number, unknown>;
  }

  targetCursor[pathSegments[pathSegments.length - 1]] = cloneValue(value);
  return nextRoot;
};

const mergeRootValue = (prev: unknown, next: unknown): unknown => {
  if (!isRecord(prev) || Array.isArray(prev)) {
    throw new Error("preview merge expected an object store value");
  }
  if (!isRecord(next) || Array.isArray(next)) {
    throw new Error("preview merge expected an object patch value");
  }
  return {
    ...cloneValue(prev),
    ...cloneValue(next),
  };
};

const patch = (
  input: Partial<RuntimePatch> & Pick<RuntimePatch, "id" | "store" | "path" | "op" | "meta">
): RuntimePatch => ({
  ...input,
});

const snapshotAllStores = (): Record<string, unknown> =>
  Object.fromEntries(
    listStores()
      .sort((left, right) => left.localeCompare(right))
      .map((storeId) => [storeId, getStoreSnapshot(storeId)])
  );

const getDeterministicNodeIds = (): RuntimeNodeId[] =>
  getComputedGraph().nodes
    .filter((node) => node.type !== "leaf")
    .map((node) => node.id)
    .filter((nodeId) => getComputedDescriptor(nodeId)?.classification === "deterministic")
    .sort((left, right) => left.localeCompare(right));

const recomputeDeterministicPreview = (snapshot: Record<string, unknown>): RuntimeNodeId[] => {
  const blocked: RuntimeNodeId[] = [];
  getDeterministicNodeIds().forEach((nodeId) => {
    const descriptor = getComputedDescriptor(nodeId);
    if (!descriptor) return;
    try {
      snapshot[descriptor.storeId] = cloneValue(evaluateComputed(nodeId, snapshot));
    } catch (_) {
      blocked.push(nodeId);
    }
  });
  return blocked;
};

const applyPatchToPreview = (
  snapshot: Record<string, unknown>,
  runtimePatch: RuntimePatch,
): void => {
  if (runtimePatch.op === "set") {
    snapshot[runtimePatch.store] = setValueAtPath(
      snapshot[runtimePatch.store],
      runtimePatch.path,
      runtimePatch.value
    );
    return;
  }
  if (runtimePatch.op === "merge" && runtimePatch.path.length === 0) {
    snapshot[runtimePatch.store] = mergeRootValue(snapshot[runtimePatch.store], runtimePatch.value);
    return;
  }
  throw new Error(`preview helper does not support patch ${runtimePatch.op} at ${runtimePatch.store}`);
};

const previewPatches = (runtimePatches: readonly RuntimePatch[]): {
  snapshot: Record<string, unknown>;
  blocked: RuntimeNodeId[];
} => {
  const snapshot = snapshotAllStores();
  runtimePatches.forEach((runtimePatch) => {
    applyPatchToPreview(snapshot, runtimePatch);
  });
  return {
    snapshot,
    blocked: recomputeDeterministicPreview(snapshot),
  };
};

test("public PSR preview stays equivalent to committed deterministic single-patch writes", async () => {
  clearAllStores();
  createStore("faithUser", {
    profile: { score: 1 },
    role: "user",
  });
  createComputed("faithDouble", ["faithUser"], (user) => (
    ((user as { profile?: { score?: number } } | null)?.profile?.score ?? 0) * 2
  ), {
    classification: "deterministic",
  });
  createComputed("faithBadge", ["faithDouble"], (score) => (
    ((score as number | null) ?? 0) >= 4 ? "pro" : "starter"
  ), {
    classification: "deterministic",
  });

  const nextPatch = patch({
    id: "faith-single",
    store: "faithUser",
    path: ["profile", "score"],
    op: "set",
    value: 3,
    meta: {
      timestamp: 101,
      source: "setStore",
    },
  });

  const preview = previewPatches([nextPatch]);
  assert.deepStrictEqual(preview.blocked, []);

  assert.deepStrictEqual(applyStorePatch(nextPatch), { ok: true });
  await flushPublicRuntime();

  assert.deepStrictEqual(snapshotAllStores(), preview.snapshot);
});

test("public PSR preview stays equivalent to committed deterministic patch batches", async () => {
  clearAllStores();
  createStore("faithInventory", {
    count: 1,
    nested: { ready: false },
  });
  createStore("faithFlags", {
    enabled: false,
  });
  createComputed("faithStatus", ["faithInventory", "faithFlags"], (inventory, flags) => ({
    total: (inventory as { count?: number } | null)?.count ?? 0,
    ready: (inventory as { nested?: { ready?: boolean } } | null)?.nested?.ready ?? false,
    enabled: (flags as { enabled?: boolean } | null)?.enabled ?? false,
  }), {
    classification: "deterministic",
  });

  const runtimePatches = [
    patch({
      id: "faith-batch-set",
      store: "faithInventory",
      path: ["nested", "ready"],
      op: "set",
      value: true,
      meta: {
        timestamp: 102,
        source: "setStore",
      },
    }),
    patch({
      id: "faith-batch-merge",
      store: "faithFlags",
      path: [],
      op: "merge",
      value: { enabled: true },
      meta: {
        timestamp: 103,
        source: "setStore",
      },
    }),
  ] as const;

  const preview = previewPatches(runtimePatches);
  assert.deepStrictEqual(preview.blocked, []);

  assert.deepStrictEqual(applyStorePatchesAtomic(runtimePatches), { ok: true });
  await flushPublicRuntime();

  assert.deepStrictEqual(snapshotAllStores(), preview.snapshot);
});

test("public PSR failed atomic batches do not expose partial state to subscribers", async () => {
  clearAllStores();
  createStore("faithAtomicA", { value: 0 });
  createStore("faithAtomicB", { value: 0 });

  const seenA: number[] = [];
  const seenB: number[] = [];
  const offA = subscribeStore("faithAtomicA", (snapshot) => {
    seenA.push((snapshot as { value?: number } | null)?.value ?? -1);
  });
  const offB = subscribeStore("faithAtomicB", (snapshot) => {
    seenB.push((snapshot as { value?: number } | null)?.value ?? -1);
  });

  try {
    assert.deepStrictEqual(applyStorePatchesAtomic([
      patch({
        id: "faith-atomic-good",
        store: "faithAtomicA",
        path: ["value"],
        op: "set",
        value: 1,
        meta: {
          timestamp: 104,
          source: "setStore",
        },
      }),
      patch({
        id: "faith-atomic-bad",
        store: "faithAtomicB",
        path: ["missing"],
        op: "set",
        value: 2,
        meta: {
          timestamp: 105,
          source: "setStore",
        },
      }),
    ]), { ok: false, reason: "path" });

    await flushPublicRuntime();

    assert.deepStrictEqual(getStoreSnapshot("faithAtomicA"), { value: 0 });
    assert.deepStrictEqual(getStoreSnapshot("faithAtomicB"), { value: 0 });
    assert.deepStrictEqual(seenA, []);
    assert.deepStrictEqual(seenB, []);
  } finally {
    offA();
    offB();
  }
});

test("public PSR deterministic preview matches committed fallback behavior when compute throws", async () => {
  clearAllStores();
  createStore("faithSafeBase", { value: 2 });
  createComputed("faithSafeDouble", ["faithSafeBase"], (base) => {
    const next = (base as { value?: number } | null)?.value ?? 0;
    if (next > 5) throw new Error("too large");
    return next * 2;
  }, {
    classification: "deterministic",
  });

  const throwingPatch = patch({
    id: "faith-safe-throw",
    store: "faithSafeBase",
    path: ["value"],
    op: "set",
    value: 10,
    meta: {
      timestamp: 106,
      source: "setStore",
    },
  });

  const preview = previewPatches([throwingPatch]);
  assert.deepStrictEqual(preview.blocked, []);
  assert.strictEqual(preview.snapshot.faithSafeDouble, 4);

  assert.deepStrictEqual(applyStorePatch(throwingPatch), { ok: true });
  await flushPublicRuntime();

  assert.deepStrictEqual(snapshotAllStores(), preview.snapshot);
});

test("public PSR preview stops at async boundaries instead of inventing downstream equivalence", async () => {
  clearAllStores();
  createStore("faithBoundarySource", { value: 1 });
  createComputed("faithBoundary", ["faithBoundarySource"], (source) => (
    ((source as { value?: number } | null)?.value ?? 0) * 2
  ), {
    classification: "asyncBoundary",
  });
  createComputed("faithAfterBoundary", ["faithBoundary"], (boundaryValue) => (
    ((boundaryValue as number | null) ?? 0) + 1
  ), {
    classification: "deterministic",
  });

  const boundaryPatch = patch({
    id: "faith-boundary",
    store: "faithBoundarySource",
    path: ["value"],
    op: "set",
    value: 4,
    meta: {
      timestamp: 107,
      source: "setStore",
    },
  });

  const downstreamDescriptor = getComputedDescriptor("faithAfterBoundary");
  assert.ok(downstreamDescriptor);

  const preview = previewPatches([boundaryPatch]);
  assert.deepStrictEqual(preview.blocked, [downstreamDescriptor!.id]);
  assert.strictEqual(preview.snapshot.faithBoundary, 2);
  assert.strictEqual(preview.snapshot.faithAfterBoundary, 3);
  assert.deepStrictEqual(getTimingContract("faithBoundarySource"), {
    simulationWindow: "pre-commit",
    executionModel: "async-boundary",
    effectScope: "out-of-pipeline",
    governanceMode: "bounded-governor",
    mutationAuthority: "exclusive",
    causalityBoundary: "async-boundary",
    reasons: [
      "downstream computed node \"faithBoundary\" is marked asyncBoundary",
    ],
  });

  assert.deepStrictEqual(applyStorePatch(boundaryPatch), { ok: true });
  await flushPublicRuntime();

  assert.deepStrictEqual(getStoreSnapshot("faithBoundarySource"), { value: 4 });
  assert.strictEqual(getStoreSnapshot("faithBoundary"), 8);
  assert.strictEqual(getStoreSnapshot("faithAfterBoundary"), 9);
});

test("public entrypoints are enough for production PSR preview and commit flows", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const script = `
    import { createStore, createComputed } from "./src/index.js";
    import { clearAllStores } from "./src/runtime-admin/index.js";
    import {
      applyStorePatch,
      evaluateComputed,
      getComputedDescriptor,
      getComputedGraph,
      getStoreSnapshot,
      getTimingContract,
    } from "./src/psr/index.js";

    const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

    clearAllStores();
    createStore("publicBase", { value: 1 }, { scope: "global" });
    createComputed("publicDouble", ["publicBase"], (base) => (
      ((base?.value ?? 0) * 2)
    ), {
      classification: "deterministic",
    });

    const descriptor = getComputedDescriptor("publicDouble");
    if (!descriptor) throw new Error("missing public descriptor");
    if (evaluateComputed(descriptor.id, { publicBase: { value: 3 }, publicDouble: 2 }) !== 6) {
      throw new Error("public evaluator mismatch");
    }

    const result = applyStorePatch({
      id: "public-commit",
      store: "publicBase",
      path: ["value"],
      op: "set",
      value: 3,
      meta: {
        timestamp: 108,
        source: "setStore",
      },
    });
    if (!result.ok) throw new Error("public patch failed");

    await wait();
    await wait();

    if (JSON.stringify(getStoreSnapshot("publicDouble")) !== "6") {
      throw new Error("public computed commit mismatch");
    }

    const graph = getComputedGraph();
    if (graph.granularity !== "store") throw new Error("public graph granularity mismatch");

    const timing = getTimingContract("publicBase");
    if (timing.governanceMode !== "full-governor") {
      throw new Error("public timing contract mismatch");
    }

    console.log("ok");
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: "production" },
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout ?? "", /ok/);
});
