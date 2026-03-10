import { deepClone, suggestStoreName } from "./utils.js";
import {
    getStoreRegistry,
    hasStoreEntry,
    normalizeStoreRegistryScope,
    defaultRegistryScope,
} from "./store-registry.js";
import type { StoreFeatureMeta } from "./feature-registry.js";

const _registry = getStoreRegistry(defaultRegistryScope);
const stores = _registry.stores;
const metaEntries = _registry.metaEntries;
const initialStates = _registry.initialStates;

const exists = (name: string): boolean => {
    if (hasStoreEntry(_registry, name)) return true;
    suggestStoreName(name, Object.keys(stores));
    return false;
};

const matchesPattern = (name: string, pattern?: string): boolean => {
    if (!pattern) return true;
    if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return name.startsWith(prefix);
    }
    return name === pattern;
};

export const listStores = (pattern?: string): string[] =>
    Object.keys(stores).filter((name) => matchesPattern(name, pattern));

export const getStoreMeta = (name: string): StoreFeatureMeta | null =>
    (exists(name) ? deepClone(metaEntries[name]) : null) as StoreFeatureMeta | null;

export const getInitialState = (): Record<string, unknown> =>
    deepClone(initialStates) as Record<string, unknown>;

export const getMetrics = (name: string): StoreFeatureMeta["metrics"] | null => {
    const meta = metaEntries[name];
    if (!meta?.metrics) return null;
    return { ...meta.metrics };
};
