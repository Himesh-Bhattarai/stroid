/**
 * @module computed
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for computed.
 *
 * Consumers: Internal imports and public API.
 */
import { store } from "./store-name.js";
import { createStore, replaceStore, getStore, hasStore, subscribeStore } from "./internals/store-ops.js";
import {
    registerComputed,
    unregisterComputed,
    markStale,
    getComputedEntry,
    isComputed,
} from "./computed-graph.js";
import { warn, isDev, log } from "./utils.js";
import { getRegistry } from "./store-lifecycle/registry.js";
import type { StoreRegistry } from "./store-registry.js";
import type { StoreDefinition, StoreKey, StoreName, StateFor, StoreValue } from "./store-lifecycle/types.js";
import type { NonFunction } from "./types/utility.js";

export type ComputedOptions = {
    autoDispose?: boolean;
    onError?: (err: unknown) => void;
};

const getComputedCleanups = (): Map<string, () => void> => getRegistry().computedCleanups;
const computedFlushHistory = new WeakMap<StoreRegistry, Map<string, number>>();
const getComputedFlushMap = (registry: StoreRegistry): Map<string, number> => {
    let map = computedFlushHistory.get(registry);
    if (!map) {
        map = new Map();
        computedFlushHistory.set(registry, map);
    }
    return map;
};

type DepHandle = StoreDefinition<string, StoreValue> | StoreKey<string, StoreValue>;
type DepValue<T> = T extends StoreDefinition<string, infer S>
    ? Readonly<S> | null
    : T extends StoreKey<string, infer S>
        ? Readonly<S> | null
        : T extends StoreName
            ? Readonly<StateFor<T>> | null
            : StoreValue | null;
export function createComputed<TResult, Deps extends readonly (StoreName | DepHandle)[]>(
    name: string,
    deps: Deps,
    compute: (...args: { [K in keyof Deps]: DepValue<Deps[K]> }) => TResult,
    options: ComputedOptions = {}
): StoreDefinition<string, TResult> | undefined {
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

    const cleanups = getComputedCleanups();
    const existingCleanup = cleanups.get(name);
    if (existingCleanup) {
        existingCleanup();
        cleanups.delete(name);
    }

    const depNames = deps.map((dep) => (typeof dep === "string" ? dep : dep?.name));
    if (depNames.some((dep) => !dep || typeof dep !== "string")) {
        warn(`createComputed("${name}") dependencies must be store names or store handles.`);
        return undefined;
    }
    if (isDev()) {
        const missing = depNames.filter((dep) => !hasStore(dep as string));
        if (missing.length > 0) {
            warn(
                `createComputed("${name}") dependencies not found at registration: ${missing.join(", ")}. ` +
                `Computed values will receive null until those stores are created.`
            );
        }
    }

    const registered = registerComputed(name, depNames as string[], compute as (...args: unknown[]) => unknown);
    if (!registered) return undefined;

    const initial = _runCompute(name, deps, compute as (...args: unknown[]) => unknown, options.onError);

    const handle = store<string, TResult>(name);
    if (!hasStore(name)) {
        createStore(name, initial as NonFunction<TResult>);
    } else {
        replaceStore(handle, initial as TResult);
    }

    const unsubscribers: Array<() => void> = [];
    for (const dep of depNames) {
        const unsub = subscribeStore(dep as string, () => {
            _recomputeAndFlush(name, depNames as string[], compute as (...args: unknown[]) => unknown, options.onError);
        });
        unsubscribers.push(unsub);
    }

    getComputedCleanups().set(name, () => {
        unsubscribers.forEach((fn) => fn());
        unregisterComputed(name);
    });

    if (isDev()) {
        log(`computed store "${name}" created, deps: [${depNames.join(", ")}]`);
    }

    return handle as StoreDefinition<string, TResult>;
}

const _runCompute = (
    name: string,
    deps: Array<string | DepHandle>,
    compute: (...args: unknown[]) => unknown,
    onError?: (err: unknown) => void
): unknown => {
    const args = deps.map((dep) => {
        if (typeof dep === "string") return getStore(store(dep));
        return getStore(dep as StoreDefinition<string, StoreValue>);
    });

    try {
        return compute(...args);
    } catch (err) {
        warn(`createComputed("${name}") compute function threw: ${(err as { message?: string })?.message ?? err}`);
        onError?.(err);
        const handle = store(name);
        return hasStore(name) ? getStore(handle) : null;
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
    const registry = getRegistry();
    if (registry.notify.isFlushing) {
        const flushId = registry.notify.flushId;
        const map = getComputedFlushMap(registry);
        if (map.get(name) === flushId) return;
        map.set(name, flushId);
    }

    const next = _runCompute(name, deps, compute, onError);
    const handle = store(name);
    const current = getStore(handle);
    if (Object.is(next, current)) return;

    replaceStore(handle, next);
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
    const cleanups = getComputedCleanups();
    const cleanup = cleanups.get(name);
    if (!cleanup) {
        if (isDev()) warn(`deleteComputed("${name}") -- not found`);
        return;
    }
    cleanup();
    cleanups.delete(name);
};

export const isComputedStore = (name: string): boolean => isComputed(name);

export const _resetComputedForTests = (): void => {
    const cleanups = getComputedCleanups();
    cleanups.forEach((fn) => fn());
    cleanups.clear();
};


