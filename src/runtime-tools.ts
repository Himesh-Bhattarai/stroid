import { deepClone, suggestStoreName } from "./utils.js";
import {
    getStoreRegistry,
    hasStoreEntry,
    normalizeStoreRegistryScope,
} from "./store-registry.js";
import type { StoreFeatureMeta } from "./feature-registry.js";

const _registry = getStoreRegistry(normalizeStoreRegistryScope(new URL("./store.js", import.meta.url).href));
const stores = _registry.stores;
const metaEntries = _registry.metaEntries;
const initialStates = _registry.initialStates;

const exists = (name: string): boolean => {
    if (hasStoreEntry(_registry, name)) return true;
    suggestStoreName(name, Object.keys(stores));
    return false;
};

export const listStores = (): string[] => Object.keys(stores);

export const getStoreMeta = (name: string): StoreFeatureMeta | null =>
    (exists(name) ? deepClone(metaEntries[name]) : null) as StoreFeatureMeta | null;

export const getInitialState = (): Record<string, unknown> =>
    deepClone(initialStates) as Record<string, unknown>;

export const getMetrics = (name: string): StoreFeatureMeta["metrics"] | null => {
    const meta = metaEntries[name];
    if (!meta?.metrics) return null;
    return { ...meta.metrics };
};
