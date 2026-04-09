/**
 * @module runtime-tools/async
 *
 * LAYER: Module
 * OWNS:  Async and feature-runtime observability helpers.
 *
 * Consumers: runtime-tools index and public API.
 */
import { countInflightSlots } from "../async/cache.js";
import { getAsyncMetrics } from "../async/fetch.js";
import { getFeatureApi } from "../core/store-lifecycle/identity.js";
import {
    findColdStores,
    getMetrics,
    getStoreMeta,
    listStores,
    runtimeToolStoreExists,
    type ColdStoreReport,
} from "./core.js";
import type { StoreFeatureMeta } from "../features/feature-registry.js";

export const getAsyncInflightCount = (name: string): number => {
    if (!runtimeToolStoreExists(name)) return 0;
    return countInflightSlots(name);
};

export const getPersistQueueDepth = (name: string): number => {
    if (!runtimeToolStoreExists(name)) return 0;
    const api = getFeatureApi("persist") as { getPersistQueueDepth?: (store: string) => number } | undefined;
    if (!api?.getPersistQueueDepth) return 0;
    return api.getPersistQueueDepth(name) ?? 0;
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
        if (!runtimeToolStoreExists(name)) return null;
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
