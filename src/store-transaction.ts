/**
 * @fileoverview src\store-transaction.ts
 */
import type { StoreValue } from "./store-lifecycle/types.js";
import {
    getActiveStoreRegistry,
    runWithRegistry,
    type StoreRegistry,
    type TransactionState,
} from "./store-registry.js";

const getTransactionState = (registry?: StoreRegistry): TransactionState =>
    (registry ?? getActiveStoreRegistry()).transaction;

const coerceError = (err?: unknown): Error => {
    if (err instanceof Error) return err;
    if (typeof err === "string") return new Error(err);
    if (err && typeof (err as any)?.message === "string") return new Error((err as any).message);
    return new Error("setStoreBatch aborted");
};

export const beginTransaction = (registry?: StoreRegistry): StoreRegistry => {
    const resolvedRegistry = registry ?? getActiveStoreRegistry();
    const state = getTransactionState(resolvedRegistry);
    state.depth += 1;
    if (state.depth === 1) {
        state.pending = [];
        state.stagedValues.clear();
        state.snapshotCache.clear();
        state.failed = false;
        state.error = undefined;
    }
    return resolvedRegistry;
};

export const isTransactionActive = (): boolean => getTransactionState().depth > 0;

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

export const getStagedTransactionValue = (name: string): { has: boolean; value: StoreValue | undefined } => {
    const state = getTransactionState();
    if (!state.stagedValues.has(name)) return { has: false, value: undefined };
    return { has: true, value: state.stagedValues.get(name) };
};

export const endTransaction = (err?: unknown, registry?: StoreRegistry): Error | null => {
    const state = getTransactionState(registry);
    if (state.depth === 0) return null;
    if (err) {
        markTransactionFailed(err, registry);
    }
    state.depth = Math.max(0, state.depth - 1);
    if (state.depth > 0) return null;

    const finalError = state.failed ? (state.error ?? new Error("setStoreBatch aborted")) : null;

    if (!finalError) {
        state.pending.forEach((fn) => fn());
    }

    state.pending = [];
    state.stagedValues.clear();
    state.snapshotCache.clear();
    state.failed = false;
    state.error = undefined;

    return finalError;
};

