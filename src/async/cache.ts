/**
 * @module async-cache
*
* LAYER: Module
* OWNS:  Module-level behavior and exports for async-cache.
*
* Consumers: Internal imports and public API.
*/
import { getActiveAsyncRegistry } from "../core/store-core.js";
export { getActiveAsyncRegistry } from "../core/store-core.js";
import { registerHook } from "../core/lifecycle-hooks.js";
import { FORBIDDEN_OBJECT_KEYS } from "../utils/validation.js";
import type {
    AsyncMetricsSnapshot,
    FetchOptions,
    WarnCategory,
    StoreCleanupKind,
    StoreCleanupBucket,
} from "./registry.js";
import { resetAsyncRegistry } from "./registry.js";
export type { FetchOptions, AsyncStateSnapshot, AsyncStateAdapter, StoreCleanupKind, AsyncMetricsSnapshot } from "./registry.js";

export type FetchInput = string | Promise<unknown> | (() => string | Promise<unknown>);

export const MAX_CACHE_SLOTS_PER_STORE = 100;
export const MAX_INFLIGHT_SLOTS_PER_STORE = 100;
export const MAX_WARNED_ENTRIES = 1000;
export const CACHE_PRUNE_INTERVAL_WRITES = 32;

const isForbiddenObjectKey = (key: string): boolean => FORBIDDEN_OBJECT_KEYS.has(key);

const safeDeleteKey = (obj: Record<string, unknown>, key: string): void => {
    if (isForbiddenObjectKey(key)) return;
    delete obj[key];
};

const safeGetKey = <T>(obj: Record<string, T>, key: string): T | undefined => {
    if (isForbiddenObjectKey(key)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
    return obj[key];
};

const safeHasKey = <T>(obj: Record<string, T>, key: string): boolean => {
    if (isForbiddenObjectKey(key)) return false;
    return Object.prototype.hasOwnProperty.call(obj, key);
};

export const getFetchRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["fetchRegistry"] =>
    getActiveAsyncRegistry().fetchRegistry;
export const getInflightRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["inflight"] =>
    getActiveAsyncRegistry().inflight;
export const getRequestVersionRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["requestVersion"] =>
    getActiveAsyncRegistry().requestVersion;
export const getRequestSequenceRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["requestSequence"] =>
    getActiveAsyncRegistry().requestSequence;
export const getCacheMeta = (): ReturnType<typeof getActiveAsyncRegistry>["cacheMeta"] =>
    getActiveAsyncRegistry().cacheMeta;
export const getRateWindowStartRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["rateWindowStart"] =>
    getActiveAsyncRegistry().rateWindowStart;
export const getRateCountRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["rateCount"] =>
    getActiveAsyncRegistry().rateCount;
export const getRatePruneState = (): ReturnType<typeof getActiveAsyncRegistry>["ratePruneState"] =>
    getActiveAsyncRegistry().ratePruneState;
export const getRevalidateHandlers = (): ReturnType<typeof getActiveAsyncRegistry>["revalidateHandlers"] =>
    getActiveAsyncRegistry().revalidateHandlers;
export const getStoreCleanups = (): ReturnType<typeof getActiveAsyncRegistry>["storeCleanups"] =>
    getActiveAsyncRegistry().storeCleanups;
export const getWarnedOnce = (): ReturnType<typeof getActiveAsyncRegistry>["warnedOnce"] =>
    getActiveAsyncRegistry().warnedOnce;
export const getAsyncUsageErrorEmissions = (): ReturnType<typeof getActiveAsyncRegistry>["usageErrorEmissions"] =>
    getActiveAsyncRegistry().usageErrorEmissions;
export const getRevalidateKeys = (): ReturnType<typeof getActiveAsyncRegistry>["revalidateKeys"] =>
    getActiveAsyncRegistry().revalidateKeys;
export const getAsyncMetrics = (): ReturnType<typeof getActiveAsyncRegistry>["asyncMetrics"] =>
    getActiveAsyncRegistry().asyncMetrics;
export const getAsyncMetricsByStore = (): ReturnType<typeof getActiveAsyncRegistry>["asyncMetricsByStore"] =>
    getActiveAsyncRegistry().asyncMetricsByStore;
export const getAsyncSlotOwners = (): ReturnType<typeof getActiveAsyncRegistry>["slotOwners"] =>
    getActiveAsyncRegistry().slotOwners;
export const getAsyncSlotsByStore = (): ReturnType<typeof getActiveAsyncRegistry>["slotsByStore"] =>
    getActiveAsyncRegistry().slotsByStore;
export const getAsyncCachePruneCounters = (): ReturnType<typeof getActiveAsyncRegistry>["cachePruneCounters"] =>
    getActiveAsyncRegistry().cachePruneCounters;

const createMetricsSnapshot = (): AsyncMetricsSnapshot => ({
    cacheHits: 0,
    cacheMisses: 0,
    dedupes: 0,
    requests: 0,
    failures: 0,
    avgMs: 0,
    lastMs: 0,
});

export const getOrCreateAsyncStoreMetrics = (name: string): AsyncMetricsSnapshot => {
    const buckets = getAsyncMetricsByStore();
    let bucket = buckets.get(name);
    if (!bucket) {
        bucket = createMetricsSnapshot();
        buckets.set(name, bucket);
    }
    return bucket;
};

const removeTrackedAsyncSlot = (name: string, cacheSlot: string): void => {
    const slotsByStore = getAsyncSlotsByStore();
    const slots = slotsByStore.get(name);
    if (slots) {
        slots.delete(cacheSlot);
        if (slots.size === 0) slotsByStore.delete(name);
    }
    getAsyncSlotOwners().delete(cacheSlot);
};

const hasSlotReferences = (cacheSlot: string): boolean => {
    const inflight = getInflightRegistry();
    const requestVersion = getRequestVersionRegistry();
    const requestSequence = getRequestSequenceRegistry();
    const cacheMeta = getCacheMeta();
    const rateWindowStart = getRateWindowStartRegistry();
    const rateCount = getRateCountRegistry();
    return safeHasKey(inflight as Record<string, unknown>, cacheSlot)
        || safeHasKey(requestVersion, cacheSlot)
        || safeHasKey(requestSequence, cacheSlot)
        || safeHasKey(cacheMeta, cacheSlot)
        || safeHasKey(rateWindowStart, cacheSlot)
        || safeHasKey(rateCount, cacheSlot);
};

export const trackAsyncSlot = (name: string, cacheSlot: string): void => {
    const owners = getAsyncSlotOwners();
    const previousOwner = owners.get(cacheSlot);
    if (previousOwner && previousOwner !== name) {
        removeTrackedAsyncSlot(previousOwner, cacheSlot);
    }
    owners.set(cacheSlot, name);
    const slotsByStore = getAsyncSlotsByStore();
    let slots = slotsByStore.get(name);
    if (!slots) {
        slots = new Set<string>();
        slotsByStore.set(name, slots);
    }
    slots.add(cacheSlot);
};

export const releaseAsyncSlotIfOrphaned = (cacheSlot: string): void => {
    if (hasSlotReferences(cacheSlot)) return;
    const owner = getAsyncSlotOwners().get(cacheSlot);
    if (!owner) return;
    removeTrackedAsyncSlot(owner, cacheSlot);
};

const isStoreSlot = (name: string, key: string): boolean =>
    key === name || key.startsWith(`${name}:`);

const collectStoreSlotsByScan = (name: string): Set<string> => {
    const slots = new Set<string>();
    const owners = getAsyncSlotOwners();
    const inflight = getInflightRegistry();
    const requestVersion = getRequestVersionRegistry();
    const requestSequence = getRequestSequenceRegistry();
    const cacheMeta = getCacheMeta();
    const rateWindowStart = getRateWindowStartRegistry();
    const rateCount = getRateCountRegistry();

    owners.forEach((owner, slot) => {
        if (owner === name) slots.add(slot);
    });

    const collectLegacySlots = (keys: string[]): void => {
        keys.forEach((key) => {
            const owner = owners.get(key);
            if (owner !== undefined) {
                if (owner === name) slots.add(key);
                return;
            }
            if (isStoreSlot(name, key)) slots.add(key);
        });
    };

    collectLegacySlots(Object.keys(inflight));
    collectLegacySlots(Object.keys(requestVersion));
    collectLegacySlots(Object.keys(requestSequence));
    collectLegacySlots(Object.keys(cacheMeta));
    collectLegacySlots(Object.keys(rateWindowStart));
    collectLegacySlots(Object.keys(rateCount));

    const collectBaseSlot = (record: Record<string, unknown>): void => {
        if (safeHasKey(record, name)) slots.add(name);
    };

    collectBaseSlot(inflight as Record<string, unknown>);
    collectBaseSlot(requestVersion as Record<string, unknown>);
    collectBaseSlot(requestSequence as Record<string, unknown>);
    collectBaseSlot(cacheMeta as Record<string, unknown>);
    collectBaseSlot(rateWindowStart as Record<string, unknown>);
    collectBaseSlot(rateCount as Record<string, unknown>);
    return slots;
};

export const noteAsyncCacheWrite = (name: string): boolean => {
    const counters = getAsyncCachePruneCounters();
    const next = (counters.get(name) ?? 0) + 1;
    counters.set(name, next);
    const slotCount = getAsyncSlotsByStore().get(name)?.size ?? 0;
    return slotCount > MAX_CACHE_SLOTS_PER_STORE || next >= CACHE_PRUNE_INTERVAL_WRITES;
};

const resetAsyncPruneCounter = (name: string): void => {
    getAsyncCachePruneCounters().delete(name);
};

const getWarnedSet = (category: WarnCategory): Set<string> => {
    const warnedOnce = getWarnedOnce();
    let set = warnedOnce.get(category);
    if (!set) {
        set = new Set<string>();
        warnedOnce.set(category, set);
    }
    return set;
};

export const markWarned = (set: Set<string>, key: string): void => {
    if (set.has(key)) return;
    set.add(key);
    if (set.size <= MAX_WARNED_ENTRIES) return;
    const oldest = set.values().next().value as string | undefined;
    if (oldest !== undefined) set.delete(oldest);
};

export const warnOnce = (category: WarnCategory, key: string, onWarn: () => void): void => {
    const set = getWarnedSet(category);
    if (set.has(key)) return;
    markWarned(set, key);
    onWarn();
};

let deleteHookCleanup: (() => void) | null = null;

const runCleanupSet = (set?: Set<() => void>): void => {
    if (!set) return;
    Array.from(set).forEach((fn) => {
        try { fn(); } catch (_) { /* ignore cleanup errors */ }
    });
};

const ensureCleanupBucket = (name: string): StoreCleanupBucket => {
    const storeCleanups = getStoreCleanups();
    let bucket = storeCleanups.get(name);
    if (!bucket) {
        bucket = Object.create(null) as StoreCleanupBucket;
        storeCleanups.set(name, bucket);
    }
    return bucket;
};

const normalizeCleanupKind = (kind: unknown): StoreCleanupKind =>
    kind === "revalidate" ? "revalidate" : "store";

const getCleanupSetByKind = (bucket: StoreCleanupBucket, kind: StoreCleanupKind): Set<() => void> | undefined =>
    kind === "revalidate" ? bucket.revalidate : bucket.store;

const setCleanupSetByKind = (bucket: StoreCleanupBucket, kind: StoreCleanupKind, set: Set<() => void>): void => {
    if (kind === "revalidate") bucket.revalidate = set;
    else bucket.store = set;
};

const deleteCleanupSetByKind = (bucket: StoreCleanupBucket, kind: StoreCleanupKind): void => {
    if (kind === "revalidate") bucket.revalidate = undefined;
    else bucket.store = undefined;
};

const pruneCleanupBucket = (name: string, bucket: StoreCleanupBucket): void => {
    if (!bucket.store && !bucket.revalidate) {
        getStoreCleanups().delete(name);
    }
};

const runCleanupBucket = (bucket: StoreCleanupBucket, kind?: StoreCleanupKind): void => {
    if (kind) {
        runCleanupSet(getCleanupSetByKind(bucket, kind));
        deleteCleanupSetByKind(bucket, kind);
        return;
    }
    runCleanupSet(bucket.store);
    runCleanupSet(bucket.revalidate);
    bucket.store = undefined;
    bucket.revalidate = undefined;
};

const runStoreCleanups = (name: string): void => {
    const storeCleanups = getStoreCleanups();
    const bucket = storeCleanups.get(name);
    if (!bucket) return;
    runCleanupBucket(bucket);
    storeCleanups.delete(name);
};

export const cleanupStoreCleanupsByKind = (kind: StoreCleanupKind): void => {
    const storeCleanups = getStoreCleanups();
    for (const [name, bucket] of storeCleanups) {
        const set = getCleanupSetByKind(bucket, kind);
        if (!set) continue;
        runCleanupBucket(bucket, kind);
        pruneCleanupBucket(name, bucket);
    }
};

const ensureDeleteHook = (): void => {
    if (deleteHookCleanup) return;
    deleteHookCleanup = registerHook("afterStoreDelete", (name) => {
        runStoreCleanups(name);
        clearAsyncMeta(name);
    });
};

export const resetAsyncState = (): void => {
    resetAsyncRegistry(getActiveAsyncRegistry());
};

export const shouldUseCache = (cacheSlot: string, ttl?: number): boolean => {
    if (!ttl) return false;
    const cacheMeta = getCacheMeta();
    const meta = safeGetKey(cacheMeta, cacheSlot);
    if (!meta) return false;
    if (meta.expiresAt !== null && meta.expiresAt <= Date.now()) {
        safeDeleteKey(cacheMeta, cacheSlot);
        releaseAsyncSlotIfOrphaned(cacheSlot);
        return false;
    }
    return Date.now() - meta.timestamp < ttl;
};

export const clearAsyncMeta = (name: string): void => {
    const fetchRegistry = getFetchRegistry();
    const cacheMeta = getCacheMeta();
    const inflight = getInflightRegistry();
    const requestVersion = getRequestVersionRegistry();
    const requestSequence = getRequestSequenceRegistry();
    const rateWindowStart = getRateWindowStartRegistry();
    const rateCount = getRateCountRegistry();
    const warnedOnce = getWarnedOnce();
    safeDeleteKey(fetchRegistry, name);
    warnedOnce.get("noSignal")?.delete(name);
    warnedOnce.get("shape")?.delete(name);
    warnedOnce.get("autoCreate")?.delete(name);
    warnedOnce.get("mutableResult")?.delete(name);
    const slots = new Set<string>(getAsyncSlotsByStore().get(name) ?? []);
    if (slots.size === 0) {
        collectStoreSlotsByScan(name).forEach((slot) => slots.add(slot));
    }
    slots.add(name);

    slots.forEach((slot) => {
        safeDeleteKey(inflight as Record<string, unknown>, slot);
        safeDeleteKey(requestVersion, slot);
        safeDeleteKey(requestSequence, slot);
        safeDeleteKey(cacheMeta, slot);
        safeDeleteKey(rateWindowStart, slot);
        safeDeleteKey(rateCount, slot);
        removeTrackedAsyncSlot(name, slot);
    });

    getAsyncSlotsByStore().delete(name);
    getAsyncMetricsByStore().delete(name);
    resetAsyncPruneCounter(name);
};

export const pruneAsyncCache = (name: string): void => {
    const cacheMeta = getCacheMeta();
    const requestVersion = getRequestVersionRegistry();
    const requestSequence = getRequestSequenceRegistry();
    const trackedSlots = getAsyncSlotsByStore().get(name) ?? collectStoreSlotsByScan(name);
    const now = Date.now();
    const slots: Array<[string, (typeof cacheMeta)[string]]> = [];

    trackedSlots.forEach((slot) => {
        const meta = safeGetKey(cacheMeta, slot);
        if (!meta) return;
        if (meta.expiresAt !== null && meta.expiresAt <= now) {
            safeDeleteKey(cacheMeta, slot);
            safeDeleteKey(requestVersion, slot);
            safeDeleteKey(requestSequence, slot);
            releaseAsyncSlotIfOrphaned(slot);
            return;
        }
        slots.push([slot, meta]);
    });

    if (slots.length <= MAX_CACHE_SLOTS_PER_STORE) {
        resetAsyncPruneCounter(name);
        return;
    }

    slots.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const overflow = slots.length - MAX_CACHE_SLOTS_PER_STORE;
    slots.slice(0, overflow).forEach(([key]) => {
        safeDeleteKey(cacheMeta, key);
        safeDeleteKey(requestVersion, key);
        safeDeleteKey(requestSequence, key);
        releaseAsyncSlotIfOrphaned(key);
    });
    resetAsyncPruneCounter(name);
};

export const countInflightSlots = (name: string): number => {
    const inflight = getInflightRegistry();
    const owners = getAsyncSlotOwners();
    const trackedSlots = getAsyncSlotsByStore().get(name);
    if (trackedSlots && trackedSlots.size > 0) {
        let indexedCount = 0;
        trackedSlots.forEach((slot) => {
            if (safeHasKey(inflight as Record<string, unknown>, slot)) indexedCount += 1;
        });
        return indexedCount;
    }

    let count = 0;
    Object.keys(inflight).forEach((key) => {
        const owner = owners.get(key);
        if (owner !== undefined) {
            if (owner === name) count += 1;
            return;
        }
        if (isStoreSlot(name, key)) count += 1;
    });
    return count;
};

export const registerStoreCleanup = (name: string, fn: () => void, kind: StoreCleanupKind = "store"): void => {
    ensureDeleteHook();
    const bucket = ensureCleanupBucket(name);
    const resolvedKind = normalizeCleanupKind(kind);
    let set = getCleanupSetByKind(bucket, resolvedKind);
    if (!set) {
        set = new Set();
        setCleanupSetByKind(bucket, resolvedKind, set);
    }
    set.add(fn);
};

export const unregisterStoreCleanup = (name: string, fn: () => void, kind?: StoreCleanupKind): void => {
    const storeCleanups = getStoreCleanups();
    const bucket = storeCleanups.get(name);
    if (!bucket) return;
    const removeFromKind = (key: StoreCleanupKind): void => {
        const set = getCleanupSetByKind(bucket, key);
        if (!set) return;
        set.delete(fn);
        if (set.size === 0) deleteCleanupSetByKind(bucket, key);
    };
    if (kind) {
        removeFromKind(normalizeCleanupKind(kind));
    } else {
        removeFromKind("store");
        removeFromKind("revalidate");
    }
    pruneCleanupBucket(name, bucket);
};

export const ensureCleanupSubscription = (_name: string): void => {
    ensureDeleteHook();
};
