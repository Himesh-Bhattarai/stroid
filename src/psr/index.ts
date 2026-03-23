/**
 * @module psr
 *
 * LAYER: Public API (native PSR contract)
 * OWNS:  Additive runtime observation/timing contract for PSR integration.
 *
 * Consumers: Public API.
 */
import {
    getStoreSnapshotNoTrack as getCommittedStoreSnapshot,
    subscribeStore as subscribeStoreByName,
} from "../core/store-notify.js";
import { scheduleFlush } from "../notification/index.js";
import { hasStore as hasStoreByName } from "../core/store-read.js";
import { nameOf } from "../core/store-lifecycle/identity.js";
import { getRegistry } from "../core/store-lifecycle/registry.js";
import { setStore, replaceStore } from "../core/store-write.js";
import {
    beginTransaction,
    endTransaction,
} from "../core/store-transaction.js";
import {
    listStores,
    getStoreMeta,
    getRuntimeGraph as getStructuredRuntimeGraph,
    getComputedDescriptor,
    evaluateComputed,
} from "../runtime-tools/index.js";
import { validateDepth } from "../utils.js";
import type { StoreFeatureMeta } from "../features/feature-registry.js";
import type {
    RuntimePatch,
    RuntimePatchMeta,
    RuntimePatchOp,
} from "../core/runtime-patch.js";
import type {
    StoreDefinition,
    StoreKey,
    StoreValue,
    WriteResult,
} from "../core/store-lifecycle/types.js";
import type {
    RuntimeGraph,
    RuntimeNodeId,
    RuntimeNodeType,
} from "../computed/types.js";

export type StoreTarget =
    | StoreDefinition<string, StoreValue>
    | StoreKey<string, StoreValue>
    | string;

export type StoreListener = (value: StoreValue | null) => void;

export type GovernanceMode = "full-governor" | "bounded-governor" | "observer";
export type MutationAuthority = "exclusive" | "shared";
export type CausalityBoundary = "none" | "async-boundary";

export interface TimingContract {
    simulationWindow: "pre-commit" | "pre-render" | "post-render";
    executionModel: "sync" | "async-boundary";
    effectScope: "in-pipeline" | "out-of-pipeline";
    governanceMode: GovernanceMode;
    mutationAuthority: MutationAuthority;
    causalityBoundary: CausalityBoundary;
    reasons: readonly string[];
}

const DEFAULT_TIMING_CONTRACT: TimingContract = {
    simulationWindow: "pre-commit",
    executionModel: "sync",
    effectScope: "out-of-pipeline",
    governanceMode: "full-governor",
    mutationAuthority: "exclusive",
    causalityBoundary: "none",
    reasons: [],
};

const INVALID_PATCH_RESULT: WriteResult = { ok: false, reason: "invalid-args" };
const UNSUPPORTED_PATCH_OP_RESULT: WriteResult = { ok: false, reason: "unsupported-op" };
const UNSUPPORTED_PATCH_PATH_RESULT: WriteResult = { ok: false, reason: "unsupported-path-shape" };

const RUNTIME_PATCH_OPS: readonly RuntimePatchOp[] = [
    "set",
    "merge",
    "delete",
    "insert",
];

const RUNTIME_PATCH_SOURCES: readonly RuntimePatchMeta["source"][] = [
    "setStore",
    "replaceStore",
    "resetStore",
    "hydrateStores",
];

const resolveTargetName = (target: StoreTarget): string =>
    nameOf(target as string | StoreDefinition<string, StoreValue>);

const hasAsyncPersistBoundary = (meta: StoreFeatureMeta | null | undefined): boolean =>
    Boolean(meta?.options.persist?.encryptAsync)
    || Boolean(meta?.options.persist?.decryptAsync)
    || meta?.options.persist?.checksum === "sha256";

const hasAsyncFeatureBoundary = (meta: StoreFeatureMeta | null | undefined): boolean =>
    Boolean(meta?.options.sync)
    || hasAsyncPersistBoundary(meta);

const hasPipelineEffects = (meta: StoreFeatureMeta | null | undefined): boolean =>
    Boolean(meta?.options.persist)
    || Boolean(meta?.options.sync)
    || meta?.options.devtools === true;

const createRuntimeNodeId = (
    type: RuntimeNodeType,
    storeId: string
): RuntimeNodeId => JSON.stringify([type, storeId, []]);

const createLeafNodeId = (storeId: string): RuntimeNodeId =>
    createRuntimeNodeId("leaf", storeId);

const createAdjacency = (
    graph: RuntimeGraph,
    direction: "forward" | "reverse"
): Map<RuntimeNodeId, RuntimeNodeId[]> => {
    const adjacency = new Map<RuntimeNodeId, RuntimeNodeId[]>();
    graph.edges.forEach((edge) => {
        const key = direction === "forward" ? edge.from : edge.to;
        const value = direction === "forward" ? edge.to : edge.from;
        const bucket = adjacency.get(key);
        if (bucket) {
            bucket.push(value);
            return;
        }
        adjacency.set(key, [value]);
    });
    return adjacency;
};

const collectReachableNodeIds = (
    startIds: readonly RuntimeNodeId[],
    adjacency: Map<RuntimeNodeId, RuntimeNodeId[]>
): Set<RuntimeNodeId> => {
    const visited = new Set<RuntimeNodeId>();
    const queue = [...startIds];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const next = adjacency.get(current);
        if (!next) continue;
        next.forEach((nodeId) => {
            if (!visited.has(nodeId)) queue.push(nodeId);
        });
    }
    return visited;
};

const uniqueSorted = (values: Iterable<string>): string[] =>
    Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

const resolveTimingTargetNodeIds = (
    targetName: string | undefined
): RuntimeNodeId[] => {
    if (!targetName) return [];
    const descriptor = getComputedDescriptor(targetName);
    if (descriptor) return [descriptor.id];
    return [createLeafNodeId(targetName)];
};

const resolveRelevantStoreIds = (
    targetName: string | undefined,
    graph: RuntimeGraph
): string[] => {
    if (!targetName) return uniqueSorted(listStores());

    const descriptor = getComputedDescriptor(targetName);
    if (!descriptor) return [targetName];

    const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
    const reverseAdjacency = createAdjacency(graph, "reverse");
    const reachable = collectReachableNodeIds([descriptor.id], reverseAdjacency);
    const leafStoreIds = Array.from(reachable)
        .map((nodeId) => nodesById.get(nodeId))
        .filter((node): node is RuntimeGraph["nodes"][number] => Boolean(node))
        .filter((node) => node.type === "leaf")
        .map((node) => node.storeId);

    return leafStoreIds.length > 0 ? uniqueSorted(leafStoreIds) : [targetName];
};

const resolveAsyncBoundaryNodeIds = (
    targetName: string | undefined,
    graph: RuntimeGraph
): RuntimeNodeId[] => {
    const asyncBoundaryIds = new Set(
        graph.nodes
            .filter((node) => node.type === "async-boundary")
            .map((node) => node.id)
    );
    if (asyncBoundaryIds.size === 0) return [];

    if (!targetName) return uniqueSorted(asyncBoundaryIds);

    const startIds = resolveTimingTargetNodeIds(targetName);
    const adjacency = createAdjacency(graph, "forward");
    const reachable = collectReachableNodeIds(startIds, adjacency);
    return uniqueSorted(
        Array.from(reachable).filter((nodeId) => asyncBoundaryIds.has(nodeId))
    );
};

const hasOwn = (value: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

const isRuntimePatchOp = (value: unknown): value is RuntimePatchOp =>
    typeof value === "string"
    && (RUNTIME_PATCH_OPS as readonly string[]).includes(value);

const isRuntimePatchSource = (value: unknown): value is RuntimePatchMeta["source"] =>
    typeof value === "string"
    && (RUNTIME_PATCH_SOURCES as readonly string[]).includes(value);

const normalizePublicPatch = (patch: RuntimePatch): RuntimePatch | null => {
    if (!patch || typeof patch !== "object") return null;
    if (!hasOwn(patch, "id") || typeof patch.id !== "string" || patch.id.length === 0) return null;
    if (!hasOwn(patch, "store") || typeof patch.store !== "string" || patch.store.length === 0) return null;
    if (!hasOwn(patch, "path") || !Array.isArray(patch.path)) return null;
    if (patch.path.some((segment) => typeof segment !== "string" && typeof segment !== "number")) return null;
    if (!isRuntimePatchOp(patch.op)) return null;
    if (!hasOwn(patch, "meta") || !patch.meta || typeof patch.meta !== "object") return null;
    if (typeof patch.meta.timestamp !== "number" || !Number.isFinite(patch.meta.timestamp)) return null;
    if (!isRuntimePatchSource(patch.meta.source)) return null;
    if (patch.meta.causedBy !== undefined) {
        if (!Array.isArray(patch.meta.causedBy)) return null;
        if (patch.meta.causedBy.some((entry) => typeof entry !== "string")) return null;
    }
    if (patch.meta.isUnsafe !== undefined && typeof patch.meta.isUnsafe !== "boolean") return null;
    if (patch.meta.asyncBoundary !== undefined && typeof patch.meta.asyncBoundary !== "boolean") return null;
    const normalizedPath = patch.path.map((segment) =>
        typeof segment === "number" ? segment : String(segment)
    );
    if (!validateDepth(normalizedPath.map((segment) => String(segment)))) {
        return null;
    }
    return {
        id: patch.id,
        store: patch.store,
        path: normalizedPath,
        op: patch.op,
        ...(hasOwn(patch, "value") ? { value: patch.value } : {}),
        meta: {
            timestamp: patch.meta.timestamp,
            source: patch.meta.source,
            ...(patch.meta.causedBy && patch.meta.causedBy.length > 0
                ? { causedBy: [...patch.meta.causedBy] }
                : {}),
            ...(patch.meta.isUnsafe === true ? { isUnsafe: true } : {}),
            ...(patch.meta.asyncBoundary === true ? { asyncBoundary: true } : {}),
        },
    };
};

const applyNormalizedPatch = (patch: RuntimePatch): WriteResult => {
    if (patch.op === "set") {
        if (patch.path.length === 0) {
            return replaceStore(patch.store as any, patch.value as any);
        }
        return setStore(
            patch.store as any,
            patch.path.map((segment) => String(segment)) as string[],
            patch.value as any
        );
    }
    if (patch.op === "merge") {
        if (patch.path.length !== 0) return UNSUPPORTED_PATCH_PATH_RESULT;
        return setStore(patch.store as any, patch.value as any);
    }
    return UNSUPPORTED_PATCH_OP_RESULT;
};

const resolveTimingContract = (targetName?: string): TimingContract => {
    const graph = getStructuredRuntimeGraph();
    const relevantStoreIds = resolveRelevantStoreIds(targetName, graph);
    const relevantMetaEntries = relevantStoreIds.map((storeId) => ({
        storeId,
        meta: getStoreMeta(storeId),
    }));
    const asyncBoundaryNodeIds = resolveAsyncBoundaryNodeIds(targetName, graph);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
    const targetDescriptor = targetName ? getComputedDescriptor(targetName) : null;

    const reasonSet = new Set<string>();

    relevantMetaEntries.forEach(({ storeId, meta }) => {
        if (meta?.options.sync) {
            reasonSet.add(`sync for "${storeId}" can apply remote writes outside the local commit path`);
        }
        if (hasAsyncPersistBoundary(meta)) {
            reasonSet.add(`persist for "${storeId}" introduces async boundary work`);
        }
    });

    asyncBoundaryNodeIds.forEach((nodeId) => {
        const storeId = nodesById.get(nodeId)?.storeId;
        if (!storeId) return;
        const label = targetDescriptor?.id === nodeId || !targetName
            ? "computed node"
            : "downstream computed node";
        reasonSet.add(`${label} "${storeId}" is marked asyncBoundary`);
    });

    const hasSharedAuthority = relevantMetaEntries.some(({ meta }) => Boolean(meta?.options.sync));
    const hasAsyncBoundary = asyncBoundaryNodeIds.length > 0
        || relevantMetaEntries.some(({ meta }) => hasAsyncFeatureBoundary(meta));
    const effectScope = relevantMetaEntries.some(({ meta }) => hasPipelineEffects(meta))
        ? "in-pipeline"
        : "out-of-pipeline";

    const governanceMode: GovernanceMode = hasSharedAuthority
        ? "observer"
        : hasAsyncBoundary
            ? "bounded-governor"
            : "full-governor";

    return {
        simulationWindow: "pre-commit",
        executionModel: hasAsyncBoundary ? "async-boundary" : "sync",
        effectScope,
        governanceMode,
        mutationAuthority: hasSharedAuthority ? "shared" : "exclusive",
        causalityBoundary: hasAsyncBoundary ? "async-boundary" : "none",
        reasons: uniqueSorted(reasonSet),
    };
};

export const getStoreSnapshot = (target: StoreTarget): StoreValue | null =>
    getCommittedStoreSnapshot(resolveTargetName(target));

export const getStoreSnapshotNoTrack = (target: StoreTarget): StoreValue | null =>
    getCommittedStoreSnapshot(resolveTargetName(target));

export const subscribeStore = (target: StoreTarget, listener: StoreListener): (() => void) =>
    subscribeStoreByName(resolveTargetName(target), listener);

export const hasStore = (target: StoreTarget): boolean =>
    hasStoreByName(resolveTargetName(target));

export const applyStorePatch = (patch: RuntimePatch): WriteResult => {
    const normalizedPatch = normalizePublicPatch(patch);
    if (!normalizedPatch) return INVALID_PATCH_RESULT;
    return applyNormalizedPatch(normalizedPatch);
};

export const applyStorePatchesAtomic = (
    patches: readonly RuntimePatch[]
): WriteResult => {
    if (!Array.isArray(patches)) return INVALID_PATCH_RESULT;
    if (patches.length === 0) return { ok: true };

    const normalizedPatches: RuntimePatch[] = [];
    for (const patch of patches) {
        const normalizedPatch = normalizePublicPatch(patch);
        if (!normalizedPatch) return INVALID_PATCH_RESULT;
        normalizedPatches.push(normalizedPatch);
    }

    const registry = getRegistry();
    const notifyState = registry.notify;
    notifyState.batchDepth = Math.max(0, notifyState.batchDepth + 1);
    beginTransaction(registry);

    let failure: WriteResult | null = null;
    let caughtError: Error | null = null;
    let finalError: Error | null = null;

    try {
        for (const patch of normalizedPatches) {
            const result = applyNormalizedPatch(patch);
            if (!result.ok) {
                failure = result;
                break;
            }
        }
    } catch (err) {
        caughtError = err instanceof Error ? err : new Error(String(err));
    } finally {
        finalError = endTransaction(
            caughtError ?? (failure ? new Error(`applyStorePatchesAtomic failed: ${failure.reason}`) : undefined),
            registry
        );
        notifyState.batchDepth = Math.max(0, notifyState.batchDepth - 1);
        if (notifyState.batchDepth === 0 && notifyState.pendingNotifications.size > 0) {
            scheduleFlush(registry);
        }
    }

    if (failure) return failure;
    if (caughtError || finalError) return { ok: false, reason: "validate" };
    return { ok: true };
};

export const getTimingContract = (target?: StoreTarget): TimingContract =>
    resolveTimingContract(target ? resolveTargetName(target) : undefined);

export const getComputedGraph = (): RuntimeGraph =>
    getStructuredRuntimeGraph();

export const getRuntimeGraph = (): RuntimeGraph =>
    getStructuredRuntimeGraph();

export {
    listStores,
    getStoreMeta,
    getComputedDescriptor,
    evaluateComputed,
};

export type {
    ComputedClassification,
    ComputedDescriptor,
    RuntimeEdgeType,
    RuntimeGraph,
    RuntimeGraphEdge,
    RuntimeGraphGranularity,
    RuntimeGraphNode,
    RuntimeNodeId,
    RuntimeNodeType,
} from "../computed/types.js";
export type {
    RuntimePatch,
    RuntimePatchMeta,
    RuntimePatchOp,
};
