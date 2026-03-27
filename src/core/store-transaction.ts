/**
 * @module store-transaction
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-transaction.
 *
 * Consumers: Internal imports and public API.
 */
import type { StoreValue } from "./store-lifecycle/types.js";
import type { RuntimePatch } from "./runtime-patch.js";
import {
    getActiveStoreRegistry,
    runWithRegistry,
    type StoreRegistry,
    type TransactionState,
    createTransactionState,
} from "./store-registry.js";
import { getCommittedStoreValueRef, setStoreValueInternal } from "./store-lifecycle/registry.js";
import { getLastRuntimePatches, setLastRuntimePatches } from "./runtime-patch.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import { warnAlways } from "../utils.js";

export type TransactionRunner = {
    run: <T>(state: TransactionState, fn: () => T) => T;
    get: () => TransactionState | null;
    enterWith?: (state: TransactionState) => void;
};

let currentTransactionRunner: TransactionRunner | null = null;

export const injectTransactionRunner = (runner: TransactionRunner | null): void => {
    if (!runner) {
        currentTransactionRunner = null;
        return;
    }
    if (currentTransactionRunner && currentTransactionRunner !== runner) {
        warnAlways(
            `injectTransactionRunner(...) was called more than once. ` +
            `The existing runner will be kept to avoid cross-request transaction leaks. ` +
            `If you need to replace it in tests, call injectTransactionRunner(null) first.`
        );
        return;
    }
    currentTransactionRunner = runner;
};

const clearTransactionRunner = (): void => {
    currentTransactionRunner = null;
};

registerTestResetHook("transaction.runner", clearTransactionRunner, 120);

const getTransactionState = (registry?: StoreRegistry): TransactionState => {
    const runnerState = currentTransactionRunner?.get();
    if (runnerState) return runnerState;
    return (registry ?? getActiveStoreRegistry()).transaction;
};

const coerceError = (err?: unknown): Error => {
    if (err instanceof Error) return err;
    if (typeof err === "string") return new Error(err);
    if (err && typeof (err as any)?.message === "string") return new Error((err as any).message);
    return new Error("setStoreBatch aborted");
};

type TransactionMetaSnapshot = {
    updatedAt: string;
    updatedAtMs: number;
    updateCount: number;
    lastCorrelationId: string | null;
    lastCorrelationAt: string | null;
    lastCorrelationAtMs: number | null;
    lastTraceContext: StoreRegistry["metaEntries"][string]["lastTraceContext"];
    metrics: StoreRegistry["metaEntries"][string]["metrics"];
};

type TransactionRollbackSnapshot = {
    stores: Map<string, StoreValue | undefined>;
    meta: Map<string, TransactionMetaSnapshot>;
    pendingNotifications: string[];
    lastRuntimePatches: readonly RuntimePatch[];
};

const cloneMetrics = (
    metrics: StoreRegistry["metaEntries"][string]["metrics"]
): StoreRegistry["metaEntries"][string]["metrics"] => ({
    notifyCount: metrics.notifyCount,
    totalNotifyMs: metrics.totalNotifyMs,
    lastNotifyMs: metrics.lastNotifyMs,
    resetCount: metrics.resetCount,
    totalResetMs: metrics.totalResetMs,
    lastResetMs: metrics.lastResetMs,
});

const snapshotMetaEntry = (
    entry: StoreRegistry["metaEntries"][string]
): TransactionMetaSnapshot => ({
    updatedAt: entry.updatedAt,
    updatedAtMs: entry.updatedAtMs,
    updateCount: entry.updateCount,
    lastCorrelationId: entry.lastCorrelationId,
    lastCorrelationAt: entry.lastCorrelationAt,
    lastCorrelationAtMs: entry.lastCorrelationAtMs,
    lastTraceContext: entry.lastTraceContext,
    metrics: cloneMetrics(entry.metrics),
});

const captureTransactionRollbackSnapshot = (
    registry: StoreRegistry
): TransactionRollbackSnapshot => {
    const stores = new Map<string, StoreValue | undefined>();
    Object.keys(registry.stores).forEach((name) => {
        stores.set(name, getCommittedStoreValueRef(name, registry));
    });

    const meta = new Map<string, TransactionMetaSnapshot>();
    Object.entries(registry.metaEntries).forEach(([name, entry]) => {
        meta.set(name, snapshotMetaEntry(entry));
    });

    return {
        stores,
        meta,
        pendingNotifications: [...registry.notify.pendingNotifications],
        lastRuntimePatches: getLastRuntimePatches(registry),
    };
};

const restoreTransactionRollbackSnapshot = (
    registry: StoreRegistry,
    snapshot: TransactionRollbackSnapshot
): void => {
    const currentStoreNames = new Set(Object.keys(registry.stores));
    snapshot.stores.forEach((value, name) => {
        setStoreValueInternal(name, value as StoreValue, registry);
        currentStoreNames.delete(name);
    });
    currentStoreNames.forEach((name) => {
        delete registry.stores[name];
    });

    snapshot.meta.forEach((metaSnapshot, name) => {
        const entry = registry.metaEntries[name];
        if (!entry) return;
        entry.updatedAt = metaSnapshot.updatedAt;
        entry.updatedAtMs = metaSnapshot.updatedAtMs;
        entry.updateCount = metaSnapshot.updateCount;
        entry.lastCorrelationId = metaSnapshot.lastCorrelationId;
        entry.lastCorrelationAt = metaSnapshot.lastCorrelationAt;
        entry.lastCorrelationAtMs = metaSnapshot.lastCorrelationAtMs;
        entry.lastTraceContext = metaSnapshot.lastTraceContext;
        entry.metrics.notifyCount = metaSnapshot.metrics.notifyCount;
        entry.metrics.totalNotifyMs = metaSnapshot.metrics.totalNotifyMs;
        entry.metrics.lastNotifyMs = metaSnapshot.metrics.lastNotifyMs;
        entry.metrics.resetCount = metaSnapshot.metrics.resetCount;
        entry.metrics.totalResetMs = metaSnapshot.metrics.totalResetMs;
        entry.metrics.lastResetMs = metaSnapshot.metrics.lastResetMs;
    });

    registry.notify.pendingNotifications.clear();
    snapshot.pendingNotifications.forEach((name) => {
        registry.notify.pendingNotifications.add(name);
    });
    setLastRuntimePatches(snapshot.lastRuntimePatches, registry);
};

export const beginTransaction = (registry?: StoreRegistry): StoreRegistry => {
    const resolvedRegistry = registry ?? getActiveStoreRegistry();
    let state = currentTransactionRunner?.get();
    if (!state && currentTransactionRunner?.enterWith) {
        state = createTransactionState();
        currentTransactionRunner.enterWith(state);
    }
    if (!state) state = getTransactionState(resolvedRegistry);
    state.depth += 1;
    if (state.depth === 1) {
        state.pending = [];
        state.stagedValues.clear();
        state.snapshotCache.clear();
        state.runtimePatches.length = 0;
        state.failed = false;
        state.error = undefined;
    }
    return resolvedRegistry;
};

export const isTransactionActive = (): boolean => {
    if (currentTransactionRunner) {
        return (currentTransactionRunner.get()?.depth ?? 0) > 0;
    }
    return getTransactionState().depth > 0;
};

export const markTransactionFailed = (err?: unknown, registry?: StoreRegistry): void => {
    const state = getTransactionState(registry);
    state.failed = true;
    if (!state.error) state.error = coerceError(err);
};

export const registerTransactionCommit = (fn: () => void): void => {
    const registry = getActiveStoreRegistry();
    const state = getTransactionState(registry);
    state.pending.push(() => runWithRegistry(registry, fn));
};

export const stageTransactionValue = (name: string, value: StoreValue): void => {
    const state = getTransactionState();
    state.stagedValues.set(name, value);
    state.snapshotCache.delete(name);
};

export const stageTransactionPatches = (patches: readonly RuntimePatch[]): void => {
    if (patches.length === 0) return;
    const state = getTransactionState();
    state.runtimePatches.push(...patches);
};

export const getStagedTransactionValue = (name: string): { has: boolean; value: StoreValue | undefined } => {
    const state = getTransactionState();
    if (!state.stagedValues.has(name)) return { has: false, value: undefined };
    return { has: true, value: state.stagedValues.get(name) };
};

export const endTransaction = (err?: unknown, registry?: StoreRegistry): Error | null => {
    const state = getTransactionState(registry);
    const resolvedRegistry = registry ?? getActiveStoreRegistry();
    if (state.depth === 0) return null;
    if (err) {
        markTransactionFailed(err, registry);
    }
    state.depth = Math.max(0, state.depth - 1);
    if (state.depth > 0) return null;

    let finalError = state.failed ? (state.error ?? new Error("setStoreBatch aborted")) : null;

    if (!finalError) {
        const rollbackSnapshot = captureTransactionRollbackSnapshot(resolvedRegistry);
        for (const fn of state.pending) {
            try {
                fn();
                if (state.failed) {
                    finalError = state.error ?? new Error("setStoreBatch aborted");
                    restoreTransactionRollbackSnapshot(resolvedRegistry, rollbackSnapshot);
                    break;
                }
            } catch (commitErr) {
                markTransactionFailed(commitErr, registry);
                if (!finalError) {
                    finalError = state.error ?? coerceError(commitErr);
                }
                restoreTransactionRollbackSnapshot(resolvedRegistry, rollbackSnapshot);
                break;
            }
        }
        if (!finalError && state.failed) {
            finalError = state.error ?? new Error("setStoreBatch aborted");
        }
    }

    if (!finalError && state.runtimePatches.length > 0) {
        setLastRuntimePatches(state.runtimePatches, resolvedRegistry);
    }

    state.pending = [];
    state.stagedValues.clear();
    state.snapshotCache.clear();
    state.runtimePatches.length = 0;
    state.failed = false;
    state.error = undefined;

    return finalError;
};


