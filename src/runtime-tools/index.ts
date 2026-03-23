/**
 * @module runtime-tools
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for runtime-tools.
 *
 * Consumers: Internal imports and public API.
 */
import { deepClone, shallowClone, suggestStoreName } from "../utils.js";
import {
    getStoreRegistry,
    hasStoreEntry,
    defaultRegistryScope,
    getActiveStoreRegistry,
} from "../core/store-registry.js";
import { subscribers } from "../core/store-lifecycle/registry.js";
import { getFeatureApi } from "../core/store-lifecycle/identity.js";
import { countInflightSlots } from "../async/cache.js";
import type { StoreFeatureMeta } from "../features/feature-registry.js";
import { getAsyncMetrics } from "../async/fetch.js";
import {
    getFullComputedGraph,
    getComputedDepsFor,
    getComputedDescriptor as getComputedDescriptorById,
    evaluateComputedFromSnapshot,
} from "../computed/computed-graph.js";
import type { ComputedDescriptor, RuntimeNodeId } from "../computed/types.js";

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

export const getStoreMeta = (name: string): StoreFeatureMeta | null => {
    if (!exists(name)) return null;
    const meta = getRegistry().metaEntries[name];
    const cloned = shallowClone(meta) as StoreFeatureMeta;
    cloned.metrics = shallowClone(meta.metrics) as StoreFeatureMeta["metrics"];
    const optionsClone = shallowClone(meta.options) as StoreFeatureMeta["options"];
    const options = optionsClone as unknown as Record<string, unknown>;
    if (options.persist && typeof options.persist === "object") {
        options.persist = shallowClone(options.persist);
    }
    if (options.sync && typeof options.sync === "object") {
        options.sync = shallowClone(options.sync);
    }
    if (options.devtools && typeof options.devtools === "object") {
        options.devtools = shallowClone(options.devtools);
    }
    if (options.lifecycle && typeof options.lifecycle === "object") {
        options.lifecycle = shallowClone(options.lifecycle);
    }
    cloned.options = optionsClone;
    return cloned;
};

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

export type ColdStoreReport = {
    name: string;
    createdAt: string;
    lastReadAt: string | null;
    updateCount: number;
    readCount: number;
    subscriberCount: number;
    ageMs: number;
    verdict: "cold" | "write-only" | "stale" | "active";
};

export const findColdStores = (options: {
    unreadThresholdMs?: number;
    includeWriteOnly?: boolean;
} = {}): ColdStoreReport[] => {
    const threshold = options.unreadThresholdMs ?? 60_000;
    const now = Date.now();
    return listStores().map((name) => {
        const meta = getRegistry().metaEntries[name];
        const createdAtMs = meta?.createdAt ? new Date(meta.createdAt).getTime() : now;
        const lastReadMs = meta?.lastReadAtMs ?? null;
        const ageMs = Math.max(0, now - createdAtMs);
        let verdict: ColdStoreReport["verdict"];

        if ((meta?.readCount ?? 0) === 0 && (meta?.updateCount ?? 0) === 0) {
            verdict = "cold";
        } else if ((meta?.readCount ?? 0) === 0) {
            verdict = "write-only";
        } else if (lastReadMs && (now - lastReadMs) > threshold) {
            verdict = "stale";
        } else {
            verdict = "active";
        }

        return {
            name,
            createdAt: meta?.createdAt ?? new Date(createdAtMs).toISOString(),
            lastReadAt: meta?.lastReadAt ?? null,
            updateCount: meta?.updateCount ?? 0,
            readCount: meta?.readCount ?? 0,
            subscriberCount: getSubscriberCount(name),
            ageMs,
            verdict,
        };
    }).filter((report) =>
        report.verdict === "cold"
        || report.verdict === "stale"
        || (options.includeWriteOnly && report.verdict === "write-only")
    );
};

export type StoreHealthEntry = {
    name: string;
    meta: StoreFeatureMeta | null;
    metrics: StoreFeatureMeta["metrics"] | null;
    async: {
        inflight: number;
        lastCorrelationId: string | null;
        traceContext: StoreFeatureMeta["lastTraceContext"] | null;
    };
    persist: {
        queueDepth: number;
    };
};

export type StoreHealthReport = {
    stores: StoreHealthEntry[];
    async: ReturnType<typeof getAsyncMetrics>;
    registry: {
        totalStores: number;
        coldStores: ColdStoreReport[];
    };
};

export const getStoreHealth = (name?: string): StoreHealthEntry | StoreHealthReport | null => {
    if (name) {
        if (!exists(name)) return null;
        const meta = getStoreMeta(name);
        return {
            name,
            meta,
            metrics: getMetrics(name),
            async: {
                inflight: getAsyncInflightCount(name),
                lastCorrelationId: meta?.lastCorrelationId ?? null,
                traceContext: meta?.lastTraceContext ?? null,
            },
            persist: {
                queueDepth: getPersistQueueDepth(name),
            },
        };
    }

    const stores = listStores().map((storeName) => getStoreHealth(storeName) as StoreHealthEntry);
    return {
        stores,
        async: getAsyncMetrics(),
        registry: {
            totalStores: stores.length,
            coldStores: findColdStores({}),
        },
    };
};

export const getPersistQueueDepth = (name: string): number => {
    if (!exists(name)) return 0;
    const api = getFeatureApi("persist") as { getPersistQueueDepth?: (store: string) => number } | undefined;
    if (!api?.getPersistQueueDepth) return 0;
    return api.getPersistQueueDepth(name) ?? 0;
};

export const getComputedGraph = () => getFullComputedGraph();

export const getComputedDeps = (name: string) => getComputedDepsFor(name);

export const getComputedDescriptor = (nodeId: RuntimeNodeId): ComputedDescriptor | null =>
    getComputedDescriptorById(nodeId);

export const evaluateComputed = (
    nodeId: RuntimeNodeId,
    snapshot: Record<string, unknown>
): unknown => evaluateComputedFromSnapshot(nodeId, snapshot);

export type { ComputedClassification, ComputedDescriptor, RuntimeNodeId } from "../computed/types.js";


