import { subscribe } from "./store-notify.js";
import { defaultRegistryScope, normalizeStoreRegistryScope } from "./store-registry.js";

export interface FetchOptions {
    transform?: (result: unknown) => unknown;
    onSuccess?: (data: unknown) => void;
    onError?: (message: string) => void;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    ttl?: number; // ms
    staleWhileRevalidate?: boolean;
    dedupe?: boolean;
    retry?: number;
    retryDelay?: number;
    retryBackoff?: number;
    signal?: AbortSignal;
    cacheKey?: string;
    responseType?: "auto" | "json" | "text" | "arrayBuffer" | "blob" | "formData";
}
export type FetchInput = string | Promise<unknown> | (() => string | Promise<unknown>);

type InflightEntry = { promise: Promise<unknown>; raw: Promise<unknown>; transform?: FetchOptions["transform"] };
export type AsyncRegistry = {
    fetchRegistry: Record<string, { kind: "url"; url: string; options: FetchOptions } | { kind: "factory"; factory: () => string | Promise<unknown>; options: FetchOptions }>;
    inflight: Partial<Record<string, InflightEntry>>;
    requestVersion: Record<string, number>;
    cacheMeta: Record<string, { timestamp: number; expiresAt: number | null; data: unknown }>;
    rateWindowStart: Record<string, number>;
    rateCount: Record<string, number>;
    noSignalWarned: Set<string>;
    cleanupSubs: Record<string, () => void>;
    storeCleanupFns: Record<string, Set<() => void>>;
    revalidateKeys: Set<string>;
    revalidateHandlers: Record<string, () => void>;
    asyncMetrics: {
        cacheHits: number;
        cacheMisses: number;
        dedupes: number;
        requests: number;
        failures: number;
        avgMs: number;
        lastMs: number;
    };
};

const _asyncRegistries = new Map<string, AsyncRegistry>();
const _scope = defaultRegistryScope;

export const MAX_CACHE_SLOTS_PER_STORE = 100;
export const MAX_INFLIGHT_SLOTS_PER_STORE = 100;

export const getAsyncRegistry = (scope: string): AsyncRegistry => {
    const existing = _asyncRegistries.get(scope);
    if (existing) return existing;
    const created: AsyncRegistry = {
        fetchRegistry: Object.create(null),
        inflight: Object.create(null),
        requestVersion: Object.create(null),
        cacheMeta: Object.create(null),
        rateWindowStart: Object.create(null),
        rateCount: Object.create(null),
        noSignalWarned: new Set<string>(),
        cleanupSubs: Object.create(null),
        storeCleanupFns: Object.create(null),
        revalidateKeys: new Set<string>(),
        revalidateHandlers: Object.create(null),
        asyncMetrics: {
            cacheHits: 0,
            cacheMisses: 0,
            dedupes: 0,
            requests: 0,
            failures: 0,
            avgMs: 0,
            lastMs: 0,
        },
    };
    _asyncRegistries.set(scope, created);
    return created;
};


let _asyncRegistry = getAsyncRegistry(_scope);
export let fetchRegistry = _asyncRegistry.fetchRegistry;
export let inflight = _asyncRegistry.inflight;
export let requestVersion = _asyncRegistry.requestVersion;
export let cacheMeta = _asyncRegistry.cacheMeta;
export let rateWindowStart = _asyncRegistry.rateWindowStart;
export let rateCount = _asyncRegistry.rateCount;
export let noSignalWarned = _asyncRegistry.noSignalWarned;
export let cleanupSubs = _asyncRegistry.cleanupSubs;
export let storeCleanupFns = _asyncRegistry.storeCleanupFns;
export let revalidateKeys = _asyncRegistry.revalidateKeys;
export let revalidateHandlers = _asyncRegistry.revalidateHandlers;
export let asyncMetrics = _asyncRegistry.asyncMetrics;

export const bindAsyncRegistry = (scope: string): void => {
    const registry = getAsyncRegistry(scope);
    _asyncRegistry = registry;
    fetchRegistry = registry.fetchRegistry;
    inflight = registry.inflight;
    requestVersion = registry.requestVersion;
    cacheMeta = registry.cacheMeta;
    rateWindowStart = registry.rateWindowStart;
    rateCount = registry.rateCount;
    noSignalWarned = registry.noSignalWarned;
    cleanupSubs = registry.cleanupSubs;
    storeCleanupFns = registry.storeCleanupFns;
    revalidateKeys = registry.revalidateKeys;
    revalidateHandlers = registry.revalidateHandlers;
    asyncMetrics = registry.asyncMetrics;
};


export const resetAsyncState = (): void => {
    Object.values(revalidateHandlers).forEach((cleanup) => {
        try { cleanup(); } catch (_) { /* ignore cleanup errors */ }
    });

    Object.values(cleanupSubs).forEach((unsubscribe) => {
        try { unsubscribe(); } catch (_) { /* ignore cleanup errors */ }
    });

    Object.values(storeCleanupFns).forEach((fns) => {
        fns.forEach((fn) => {
            try { fn(); } catch (_) { /* ignore cleanup errors */ }
        });
    });

    Object.keys(fetchRegistry).forEach((key) => delete fetchRegistry[key]);
    Object.keys(inflight).forEach((key) => delete inflight[key]);
    Object.keys(requestVersion).forEach((key) => delete requestVersion[key]);
    Object.keys(cacheMeta).forEach((key) => delete cacheMeta[key]);
    Object.keys(rateWindowStart).forEach((key) => delete rateWindowStart[key]);
    Object.keys(rateCount).forEach((key) => delete rateCount[key]);
    Object.keys(cleanupSubs).forEach((key) => delete cleanupSubs[key]);
    Object.keys(storeCleanupFns).forEach((key) => delete storeCleanupFns[key]);
    Object.keys(revalidateHandlers).forEach((key) => delete revalidateHandlers[key]);

    revalidateKeys.clear();
    noSignalWarned.clear();

    asyncMetrics.cacheHits = 0;
    asyncMetrics.cacheMisses = 0;
    asyncMetrics.dedupes = 0;
    asyncMetrics.requests = 0;
    asyncMetrics.failures = 0;
    asyncMetrics.avgMs = 0;
    asyncMetrics.lastMs = 0;
};

export const shouldUseCache = (cacheSlot: string, ttl?: number): boolean => {
    if (!ttl) return false;
    const meta = cacheMeta[cacheSlot];
    if (!meta) return false;
    if (meta.expiresAt !== null && meta.expiresAt <= Date.now()) {
        delete cacheMeta[cacheSlot];
        return false;
    }
    return Date.now() - meta.timestamp < ttl;
};

export const clearAsyncMeta = (name: string): void => {
    delete fetchRegistry[name];
    noSignalWarned.delete(name);

    const startsWithName = (key: string) => key === name || key.startsWith(`${name}:`);

    Object.keys(inflight).forEach((k) => { if (startsWithName(k)) delete inflight[k]; });
    Object.keys(requestVersion).forEach((k) => { if (startsWithName(k)) delete requestVersion[k]; });
    Object.keys(cacheMeta).forEach((k) => { if (startsWithName(k)) delete cacheMeta[k]; });
};

export const pruneAsyncCache = (name: string): void => {
    const prefix = `${name}:`;
    const slots = Object.entries(cacheMeta)
        .filter(([key, meta]) => {
            if (key !== name && !key.startsWith(prefix)) return false;
            if (meta.expiresAt !== null && meta.expiresAt <= Date.now()) {
                delete cacheMeta[key];
                return false;
            }
            return true;
        })
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

    if (slots.length <= MAX_CACHE_SLOTS_PER_STORE) return;
    const overflow = slots.length - MAX_CACHE_SLOTS_PER_STORE;
    slots.slice(0, overflow).forEach(([key]) => {
        delete cacheMeta[key];
        delete requestVersion[key];
    });
};

export const countInflightSlots = (name: string): number => {
    const prefix = `${name}:`;
    let count = 0;
    Object.keys(inflight).forEach((key) => {
        if (key === name || key.startsWith(prefix)) count += 1;
    });
    return count;
};

export const registerStoreCleanup = (name: string, fn: () => void): void => {
    if (!storeCleanupFns[name]) storeCleanupFns[name] = new Set();
    storeCleanupFns[name].add(fn);
    ensureCleanupSubscription(name);
};

export const unregisterStoreCleanup = (name: string, fn: () => void): void => {
    const fns = storeCleanupFns[name];
    if (!fns) return;
    fns.delete(fn);
    if (fns.size === 0) delete storeCleanupFns[name];
};

export const ensureCleanupSubscription = (name: string): void => {
    if (cleanupSubs[name]) return;
    cleanupSubs[name] = subscribe(name, (state) => {
        if (state !== null) return;
        const fns = storeCleanupFns[name];
        if (fns) {
            fns.forEach((fn) => {
                try { fn(); } catch (_) { /* ignore cleanup errors */ }
            });
            delete storeCleanupFns[name];
        }
        cleanupSubs[name]?.();
        delete cleanupSubs[name];
        clearAsyncMeta(name);
    });
};
