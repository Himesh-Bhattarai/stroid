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
    getComputedGraph,
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

export type StoreTarget =
    | StoreDefinition<string, StoreValue>
    | StoreKey<string, StoreValue>
    | string;

export type StoreListener = (value: StoreValue | null) => void;

export interface TimingContract {
    simulationWindow: "pre-commit" | "pre-render" | "post-render";
    executionModel: "sync" | "async-boundary";
    effectScope: "in-pipeline" | "out-of-pipeline";
}

const DEFAULT_TIMING_CONTRACT: TimingContract = {
    simulationWindow: "pre-commit",
    executionModel: "sync",
    effectScope: "out-of-pipeline",
};

const INVALID_PATCH_RESULT: WriteResult = { ok: false, reason: "invalid-args" };

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

const hasAsyncBoundary = (meta: StoreFeatureMeta | null | undefined): boolean =>
    Boolean(meta?.options.sync)
    || Boolean(meta?.options.persist?.encryptAsync)
    || Boolean(meta?.options.persist?.decryptAsync);

const hasPipelineEffects = (meta: StoreFeatureMeta | null | undefined): boolean =>
    Boolean(meta?.options.persist)
    || Boolean(meta?.options.sync)
    || meta?.options.devtools === true;

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
        if (patch.path.length !== 0) return INVALID_PATCH_RESULT;
        return setStore(patch.store as any, patch.value as any);
    }
    return INVALID_PATCH_RESULT;
};

const resolveTimingContract = (metaEntries: Array<StoreFeatureMeta | null | undefined>): TimingContract => {
    if (metaEntries.length === 0) return DEFAULT_TIMING_CONTRACT;
    return {
        simulationWindow: "pre-commit",
        executionModel: metaEntries.some((entry) => hasAsyncBoundary(entry))
            ? "async-boundary"
            : "sync",
        effectScope: metaEntries.some((entry) => hasPipelineEffects(entry))
            ? "in-pipeline"
            : "out-of-pipeline",
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
    target
        ? resolveTimingContract([getStoreMeta(resolveTargetName(target))])
        : resolveTimingContract(listStores().map((storeId) => getStoreMeta(storeId)));

export {
    listStores,
    getStoreMeta,
    getComputedGraph,
};

export type {
    RuntimePatch,
    RuntimePatchMeta,
    RuntimePatchOp,
};
