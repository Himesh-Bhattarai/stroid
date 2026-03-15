import { deepClone, suggestStoreName } from "./utils.js";
import {
    getStoreRegistry,
    hasStoreEntry,
    defaultRegistryScope,
    getActiveStoreRegistry,
} from "./store-registry.js";
import { subscribers } from "./store-lifecycle/registry.js";
import { getFeatureApi } from "./store-lifecycle/identity.js";
import { countInflightSlots } from "./async-cache.js";
import type { StoreFeatureMeta } from "./feature-registry.js";
import { getFullComputedGraph, getComputedDepsFor } from "./computed-graph.js";

const getRegistry = () => getActiveStoreRegistry(getStoreRegistry(defaultRegistryScope));

const exists = (name: string): boolean => {
    const registry = getRegistry();
    if (hasStoreEntry(registry, name)) return true;
    suggestStoreName(name, Object.keys(registry.stores));
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

export const listStores = (pattern?: string): string[] => {
    const registry = getRegistry();
    return Object.keys(registry.stores).filter((name) => matchesPattern(name, pattern));
};

export const getStoreMeta = (name: string): StoreFeatureMeta | null =>
    (exists(name) ? deepClone(getRegistry().metaEntries[name]) : null) as StoreFeatureMeta | null;

export const getInitialState = (): Record<string, unknown> =>
    deepClone(getRegistry().initialStates) as Record<string, unknown>;

export const getMetrics = (name: string): StoreFeatureMeta["metrics"] | null => {
    const meta = getRegistry().metaEntries[name];
    if (!meta?.metrics) return null;
    return { ...meta.metrics };
};

export const getSubscriberCount = (name: string): number => {
    if (!exists(name)) return 0;
    return subscribers[name]?.size ?? 0;
};

export const getAsyncInflightCount = (name: string): number => {
    if (!exists(name)) return 0;
    return countInflightSlots(name);
};

export const getPersistQueueDepth = (name: string): number => {
    if (!exists(name)) return 0;
    const api = getFeatureApi("persist") as { getPersistQueueDepth?: (store: string) => number } | undefined;
    if (!api?.getPersistQueueDepth) return 0;
    return api.getPersistQueueDepth(name) ?? 0;
};

export const getComputedGraph = () => getFullComputedGraph();

export const getComputedDeps = (name: string) => getComputedDepsFor(name);
