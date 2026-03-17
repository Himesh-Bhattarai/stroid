/**
 * @module store-read
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store-read.
 *
 * Consumers: Internal imports and public API.
 */
import {
    deepClone,
    shallowClone,
    getByPath,
    validateDepth,
    type PathInput,
} from "./utils.js";
import { getConfig } from "./internals/config.js";
import {
    hasStoreEntryInternal,
    getStoreValueRef,
    getRegistry,
} from "./store-lifecycle/registry.js";
import { materializeInitial } from "./store-lifecycle/validation.js";
import { nameOf, exists, getFeatureApi } from "./store-lifecycle/identity.js";
import type {
    Path,
    PathValue,
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
} from "./store-lifecycle/types.js";
import type { SnapshotMode } from "./adapters/options.js";
import type { FeatureMetrics } from "./feature-registry.js";

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

const resolveSnapshotMode = (
    metaEntry: { options?: { snapshot?: SnapshotMode } } | undefined,
    fallback: SnapshotMode
): SnapshotMode => {
    const mode = metaEntry?.options?.snapshot ?? fallback;
    return mode === "shallow" || mode === "ref" ? mode : "deep";
};

const cloneSnapshot = (value: StoreValue, mode: SnapshotMode): StoreValue => {
    if (mode === "ref") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
};

export function getStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P): StoreSnapshot<PathValue<State, P>> | null;
export function getStore<Name extends string, State>(name: StoreDefinition<Name, State>, path?: undefined): StoreSnapshot<State> | null;
export function getStore<Name extends string, State, P extends Path<State>>(name: StoreKey<Name, State>, path: P): StoreSnapshot<PathValue<State, P>> | null;
export function getStore<Name extends string, State>(name: StoreKey<Name, State>, path?: undefined): StoreSnapshot<State> | null;
export function getStore<Name extends StoreName, P extends Path<StateFor<Name>>>(name: Name, path: P): StoreSnapshot<PathValue<StateFor<Name>, P>> | null;
export function getStore<Name extends StoreName>(name: Name, path?: undefined): StoreSnapshot<StateFor<Name>> | null;
export function getStore(name: string | StoreDefinition<string, StoreValue>, path?: PathInput): StoreValue | null {
    const storeName = nameOf(name);
    if (!exists(storeName)) return null;
    const registry = getRegistry();
    if (!materializeInitial(storeName, registry)) return null;
    const data = getStoreValueRef(storeName, registry);
    const snapshotMode = resolveSnapshotMode(registry.metaEntries[storeName], getConfig().defaultSnapshotMode);
    if (path === undefined) {
        if (data === null || typeof data !== "object") return data as StoreValue;
        return cloneSnapshot(data, snapshotMode);
    }
    if (!validateDepth(path)) return null;
    const value = getByPath(data, path);
    if (value === null || typeof value !== "object") return value as StoreValue;
    return cloneSnapshot(value, snapshotMode);
}

export const hasStore = (name: string): boolean => hasStoreEntryInternal(name);

export { hasStoreEntryInternal as _hasStoreEntryInternal, getStoreValueRef as _getStoreValueRef, getFeatureApi as _getFeatureApi };

export const getInitialState = (): Record<string, StoreValue> => {
    const registry = getRegistry();
    return deepClone(registry.initialStates) as Record<string, StoreValue>;
};

export const getMetrics = (name: string): FeatureMetrics | null => {
    const registry = getRegistry();
    const metaEntry = registry.metaEntries[name];
    if (!metaEntry?.metrics) return null;
    return { ...metaEntry.metrics };
};


