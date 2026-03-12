/**
 * @module computed
 *
 * LAYER: Public Computed API
 * OWNS:  createComputed, invalidateComputed
 *
 * DOES NOT KNOW about: React, async, persist, sync, devtools.
 *
 * Consumers: index.ts, computed-entry.ts
 */
import { createStore, setStore, getStore, hasStore } from "./store.js";
import { subscribeStore } from "./store-notify.js";
import {
    registerComputed,
    unregisterComputed,
    markStale,
    getComputedEntry,
    isComputed,
} from "./computed-graph.js";
import { warn, isDev } from "./utils.js";
import type { StoreDefinition } from "./store-lifecycle.js";

export type ComputedOptions = {
    autoDispose?: boolean;
    onError?: (err: unknown) => void;
};

export const createComputed = <TResult = unknown>(
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => TResult,
    options: ComputedOptions = {}
): StoreDefinition<string, TResult> | undefined => {
    if (!name || typeof name !== "string") {
        warn("createComputed requires a store name as first argument");
        return undefined;
    }

    if (!Array.isArray(deps) || deps.length === 0) {
        warn(`createComputed("${name}") requires at least one dependency`);
        return undefined;
    }

    if (typeof compute !== "function") {
        warn(`createComputed("${name}") requires a compute function as third argument`);
        return undefined;
    }

    const registered = registerComputed(name, deps, compute as (...args: unknown[]) => unknown);
    if (!registered) return undefined;

    const initial = _runCompute(name, deps, compute as (...args: unknown[]) => unknown, options.onError);

    if (!hasStore(name)) {
        createStore(name, initial as TResult);
    } else {
        setStore(name, () => initial as any);
    }

    const unsubscribers: Array<() => void> = [];
    for (const dep of deps) {
        const unsub = subscribeStore(dep, () => {
            _recomputeAndFlush(name, deps, compute as (...args: unknown[]) => unknown, options.onError);
        });
        unsubscribers.push(unsub);
    }

    _computedCleanups.set(name, () => {
        unsubscribers.forEach((fn) => fn());
        unregisterComputed(name);
    });

    if (isDev()) {
        console.log(`[stroid] computed store "${name}" created, deps: [${deps.join(", ")}]`);
    }

    return { name } as StoreDefinition<string, TResult>;
};

const _computedCleanups = new Map<string, () => void>();

const _runCompute = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown,
    onError?: (err: unknown) => void
): unknown => {
    const args = deps.map((dep) => getStore(dep));

    try {
        return compute(...args);
    } catch (err) {
        warn(`createComputed("${name}") compute function threw: ${(err as { message?: string })?.message ?? err}`);
        onError?.(err);
        return hasStore(name) ? getStore(name) : null;
    }
};

const _recomputeAndFlush = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown,
    onError?: (err: unknown) => void
): void => {
    const entry = getComputedEntry(name);
    if (!entry) return;

    const next = _runCompute(name, deps, compute, onError);
    const current = getStore(name);
    if (Object.is(next, current)) return;

    setStore(name, () => next as any);
    markStale(name);
};

export const invalidateComputed = (name: string): void => {
    const entry = getComputedEntry(name);
    if (!entry) {
        warn(`invalidateComputed("${name}") -- "${name}" is not a computed store`);
        return;
    }
    markStale(name);
    _recomputeAndFlush(name, entry.deps, entry.compute);
};

export const deleteComputed = (name: string): void => {
    const cleanup = _computedCleanups.get(name);
    if (!cleanup) {
        if (isDev()) warn(`deleteComputed("${name}") -- not found`);
        return;
    }
    cleanup();
    _computedCleanups.delete(name);
};

export const isComputedStore = (name: string): boolean => isComputed(name);

export const _resetComputedForTests = (): void => {
    _computedCleanups.forEach((fn) => fn());
    _computedCleanups.clear();
};
