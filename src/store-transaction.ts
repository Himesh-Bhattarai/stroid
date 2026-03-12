import type { StoreValue } from "./store-lifecycle/types.js";

type TransactionState = {
    depth: number;
    pending: Array<() => void>;
    stagedValues: Map<string, StoreValue>;
    failed: boolean;
    error?: Error;
};

const state: TransactionState = {
    depth: 0,
    pending: [],
    stagedValues: new Map(),
    failed: false,
    error: undefined,
};

const coerceError = (err?: unknown): Error => {
    if (err instanceof Error) return err;
    if (typeof err === "string") return new Error(err);
    if (err && typeof (err as any)?.message === "string") return new Error((err as any).message);
    return new Error("setStoreBatch aborted");
};

export const beginTransaction = (): void => {
    state.depth += 1;
    if (state.depth === 1) {
        state.pending = [];
        state.stagedValues.clear();
        state.failed = false;
        state.error = undefined;
    }
};

export const isTransactionActive = (): boolean => state.depth > 0;

export const markTransactionFailed = (err?: unknown): void => {
    state.failed = true;
    if (!state.error) state.error = coerceError(err);
};

export const registerTransactionCommit = (fn: () => void): void => {
    state.pending.push(fn);
};

export const stageTransactionValue = (name: string, value: StoreValue): void => {
    state.stagedValues.set(name, value);
};

export const getStagedTransactionValue = (name: string): { has: boolean; value: StoreValue | undefined } => {
    if (!state.stagedValues.has(name)) return { has: false, value: undefined };
    return { has: true, value: state.stagedValues.get(name) };
};

export const endTransaction = (err?: unknown): Error | null => {
    if (state.depth === 0) return null;
    if (err) {
        markTransactionFailed(err);
    }
    state.depth = Math.max(0, state.depth - 1);
    if (state.depth > 0) return null;

    const finalError = state.failed ? (state.error ?? new Error("setStoreBatch aborted")) : null;

    if (!finalError) {
        state.pending.forEach((fn) => {
            fn();
        });
    }

    state.pending = [];
    state.stagedValues.clear();
    state.failed = false;
    state.error = undefined;

    return finalError;
};
