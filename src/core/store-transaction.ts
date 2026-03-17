/**
 * @module store-transaction
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-transaction.
 *
 * Consumers: Internal imports and public API.
 */
import type { StoreValue } from "./store-lifecycle/types.js";
import {
    getActiveStoreRegistry,
    runWithRegistry,
    type StoreRegistry,
    type TransactionState,
    createTransactionState,
} from "./store-registry.js";
import { registerTestResetHook } from "../internals/test-reset.js";

export type TransactionRunner = {
    run: <T>(state: TransactionState, fn: () => T) => T;
    get: () => TransactionState | null;
    enterWith?: (state: TransactionState) => void;
};

let currentTransactionRunner: TransactionRunner | null = null;

export const injectTransactionRunner = (runner: TransactionRunner | null): void => {
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


