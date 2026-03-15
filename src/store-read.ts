/**
 * @fileoverview src\store-read.ts
 */
import {
    deepClone,
    getByPath,
    validateDepth,
    type PathInput,
} from "./utils.js";
import {
    initialStates,
    meta,
    hasStoreEntryInternal,
    getStoreValueRef,
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

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

export function getStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P): StoreSnapshot<PathValue<State, P>> | null;
export function getStore<Name extends string, State>(name: StoreDefinition<Name, State>, path?: undefined): StoreSnapshot<State> | null;
export function getStore<Name extends string, State, P extends Path<State>>(name: StoreKey<Name, State>, path: P): StoreSnapshot<PathValue<State, P>> | null;
export function getStore<Name extends string, State>(name: StoreKey<Name, State>, path?: undefined): StoreSnapshot<State> | null;
export function getStore<Name extends StoreName, P extends Path<StateFor<Name>>>(name: Name, path: P): StoreSnapshot<PathValue<StateFor<Name>, P>> | null;
export function getStore<Name extends StoreName>(name: Name, path?: undefined): StoreSnapshot<StateFor<Name>> | null;
export function getStore(name: string | StoreDefinition<string, StoreValue>, path?: PathInput): StoreValue | null {
    const storeName = nameOf(name);
    if (!exists(storeName)) return null;
    if (!materializeInitial(storeName)) return null;
    const data = getStoreValueRef(storeName);
    if (path === undefined) {
        if (data === null || typeof data !== "object") return data as StoreValue;
        return deepClone(data);
    }
    if (!validateDepth(path)) return null;
    const value = getByPath(data, path);
    if (value === null || typeof value !== "object") return value as StoreValue;
    return deepClone(value);
}

export const hasStore = (name: string): boolean => hasStoreEntryInternal(name);

export { hasStoreEntryInternal as _hasStoreEntryInternal, getStoreValueRef as _getStoreValueRef, getFeatureApi as _getFeatureApi };

export const getInitialState = (): Record<string, StoreValue> => deepClone(initialStates) as Record<string, StoreValue>;

export const getMetrics = (name: string): (typeof meta)[string]["metrics"] | null => {
    const metaEntry = meta[name];
    if (!metaEntry?.metrics) return null;
    return { ...metaEntry.metrics };
};

