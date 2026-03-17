/**
 * @module async-cache
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for async-cache.
 *
 * Consumers: Internal imports and public API.
 */
import { getRegistry } from "./store-lifecycle/registry.js";
import { registerHook } from "./core/lifecycle-hooks.js";
import type { FetchOptions, WarnCategory } from "./async-registry.js";
import { resetAsyncRegistry } from "./async-registry.js";
export type { FetchOptions, AsyncStateSnapshot, AsyncStateAdapter } from "./async-registry.js";

export type FetchInput = string | Promise<unknown> | (() => string | Promise<unknown>);

export const MAX_CACHE_SLOTS_PER_STORE = 100;
export const MAX_INFLIGHT_SLOTS_PER_STORE = 100;
export const MAX_WARNED_ENTRIES = 1000;

export const getActiveAsyncRegistry = () => getRegistry().async;
export const getFetchRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["fetchRegistry"] =>
    getActiveAsyncRegistry().fetchRegistry;
export const getInflightRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["inflight"] =>
    getActiveAsyncRegistry().inflight;
export const getRequestVersionRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["requestVersion"] =>
    getActiveAsyncRegistry().requestVersion;
export const getCacheMeta = (): ReturnType<typeof getActiveAsyncRegistry>["cacheMeta"] =>
    getActiveAsyncRegistry().cacheMeta;
export const getRateWindowStartRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["rateWindowStart"] =>
    getActiveAsyncRegistry().rateWindowStart;
export const getRateCountRegistry = (): ReturnType<typeof getActiveAsyncRegistry>["rateCount"] =>
    getActiveAsyncRegistry().rateCount;
export const getRatePruneState = (): ReturnType<typeof getActiveAsyncRegistry>["ratePruneState"] =>
    getActiveAsyncRegistry().ratePruneState;
export const getCleanupSubs = (): ReturnType<typeof getActiveAsyncRegistry>["cleanupSubs"] =>
    getActiveAsyncRegistry().cleanupSubs;
export const getStoreCleanupFns = (): ReturnType<typeof getActiveAsyncRegistry>["storeCleanupFns"] =>
    getActiveAsyncRegistry().storeCleanupFns;
export const getRevalidateHandlers = (): ReturnType<typeof getActiveAsyncRegistry>["revalidateHandlers"] =>
    getActiveAsyncRegistry().revalidateHandlers;
export const getWildcardCleanups = (): ReturnType<typeof getActiveAsyncRegistry>["wildcardCleanups"] =>
    getActiveAsyncRegistry().wildcardCleanups;
export const getWarnedOnce = (): ReturnType<typeof getActiveAsyncRegistry>["warnedOnce"] =>
    getActiveAsyncRegistry().warnedOnce;
export const getRevalidateKeys = (): ReturnType<typeof getActiveAsyncRegistry>["revalidateKeys"] =>
    getActiveAsyncRegistry().revalidateKeys;
export const getAsyncMetrics = (): ReturnType<typeof getActiveAsyncRegistry>["asyncMetrics"] =>
    getActiveAsyncRegistry().asyncMetrics;

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

const ensureDeleteHook = (): void => {
    if (deleteHookCleanup) return;
    deleteHookCleanup = registerHook("afterStoreDelete", (name) => {
        const cleanupSubs = getCleanupSubs();
        const cleanup = cleanupSubs[name];
        if (cleanup) {
            cleanup();
            return;
        }
        const storeCleanupFns = getStoreCleanupFns();
        const fns = storeCleanupFns[name];
        if (fns) {
            fns.forEach((fn) => {
                try { fn(); } catch (_) { /* ignore cleanup errors */ }
            });
            delete storeCleanupFns[name];
        }
        clearAsyncMeta(name);
    });
};

export const resetAsyncState = (): void => {
    resetAsyncRegistry(getActiveAsyncRegistry());
};

export const shouldUseCache = (cacheSlot: string, ttl?: number): boolean => {
    if (!ttl) return false;
    const cacheMeta = getCacheMeta();
    const meta = cacheMeta[cacheSlot];
    if (!meta) return false;
    if (meta.expiresAt !== null && meta.expiresAt <= Date.now()) {
        delete cacheMeta[cacheSlot];
        return false;
    }
    return Date.now() - meta.timestamp < ttl;
};

export const clearAsyncMeta = (name: string): void => {
    const fetchRegistry = getFetchRegistry();
    const cacheMeta = getCacheMeta();
    const inflight = getInflightRegistry();
    const requestVersion = getRequestVersionRegistry();
    const rateWindowStart = getRateWindowStartRegistry();
    const rateCount = getRateCountRegistry();
    const warnedOnce = getWarnedOnce();
    delete fetchRegistry[name];
    warnedOnce.get("noSignal")?.delete(name);
    warnedOnce.get("shape")?.delete(name);
    warnedOnce.get("autoCreate")?.delete(name);
    warnedOnce.get("mutableResult")?.delete(name);

    const startsWithName = (key: string) => key === name || key.startsWith(`${name}:`);

    Object.keys(inflight).forEach((k) => { if (startsWithName(k)) delete inflight[k]; });
    Object.keys(requestVersion).forEach((k) => { if (startsWithName(k)) delete requestVersion[k]; });
    Object.keys(cacheMeta).forEach((k) => { if (startsWithName(k)) delete cacheMeta[k]; });
    Object.keys(rateWindowStart).forEach((k) => { if (startsWithName(k)) delete rateWindowStart[k]; });
    Object.keys(rateCount).forEach((k) => { if (startsWithName(k)) delete rateCount[k]; });
};

export const pruneAsyncCache = (name: string): void => {
    const prefix = `${name}:`;
    const cacheMeta = getCacheMeta();
    const requestVersion = getRequestVersionRegistry();
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
    const inflight = getInflightRegistry();
    let count = 0;
    Object.keys(inflight).forEach((key) => {
        if (key === name || key.startsWith(prefix)) count += 1;
    });
    return count;
};

export const registerStoreCleanup = (name: string, fn: () => void): void => {
    const storeCleanupFns = getStoreCleanupFns();
    if (!storeCleanupFns[name]) storeCleanupFns[name] = new Set();
    storeCleanupFns[name].add(fn);
    ensureCleanupSubscription(name);
};

export const unregisterStoreCleanup = (name: string, fn: () => void): void => {
    const storeCleanupFns = getStoreCleanupFns();
    const fns = storeCleanupFns[name];
    if (!fns) return;
    fns.delete(fn);
    if (fns.size === 0) delete storeCleanupFns[name];
};

export const ensureCleanupSubscription = (name: string): void => {
    ensureDeleteHook();
    const cleanupSubs = getCleanupSubs();
    const storeCleanupFns = getStoreCleanupFns();
    if (cleanupSubs[name]) return;
    cleanupSubs[name] = () => {
        const fns = storeCleanupFns[name];
        if (fns) {
            fns.forEach((fn) => {
                try { fn(); } catch (_) { /* ignore cleanup errors */ }
            });
            delete storeCleanupFns[name];
        }
        delete cleanupSubs[name];
        clearAsyncMeta(name);
    };
};


