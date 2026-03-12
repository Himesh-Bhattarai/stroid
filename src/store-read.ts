import {
    deepClone,
    getByPath,
    validateDepth,
    type PathInput,
} from "./utils.js";
import {
    initialStates,
    meta,
    nameOf,
    stores,
    hasStoreEntryInternal,
    getStoreValueRef,
    getFeatureApi,
    materializeInitial,
    exists,
    type Path,
    type PathValue,
    type StoreDefinition,
    type StoreValue,
    type StoreKey,
    type StoreName,
    type StateFor,
    type UnregisteredStoreName,
} from "./store-lifecycle.js";

export function getStore<Name extends string, State, P extends Path<State>>(name: StoreDefinition<Name, State>, path: P): PathValue<State, P> | null;
export function getStore<Name extends string, State>(name: StoreDefinition<Name, State>, path?: undefined): State | null;
export function getStore<Name extends string, State, P extends Path<State>>(name: StoreKey<Name, State>, path: P): PathValue<State, P> | null;
export function getStore<Name extends string, State>(name: StoreKey<Name, State>, path?: undefined): State | null;
export function getStore<Name extends StoreName, P extends Path<StateFor<Name>>>(name: Name, path: P): PathValue<StateFor<Name>, P> | null;
export function getStore<Name extends StoreName>(name: Name, path?: undefined): StateFor<Name> | null;
export function getStore<Name extends string>(name: UnregisteredStoreName<Name>, path?: PathInput): StoreValue | null;
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
