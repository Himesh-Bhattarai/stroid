import { subscribe } from "./store-notify.js";
import { getRegistry } from "./store-lifecycle/registry.js";
import type { FetchOptions } from "./async-registry.js";
import { resetAsyncRegistry } from "./async-registry.js";
export type { FetchOptions, AsyncStateSnapshot, AsyncStateAdapter } from "./async-registry.js";

export type FetchInput = string | Promise<unknown> | (() => string | Promise<unknown>);

export const MAX_CACHE_SLOTS_PER_STORE = 100;
export const MAX_INFLIGHT_SLOTS_PER_STORE = 100;

export const getActiveAsyncRegistry = () => getRegistry().async;

const createAsyncObjectProxy = <T extends object>(getter: () => T): T =>
    new Proxy(Object.create(null), {
        get: (_target, prop) => (getter() as any)[prop],
        set: (_target, prop, value) => {
            (getter() as any)[prop] = value;
            return true;
        },
        deleteProperty: (_target, prop) => {
            delete (getter() as any)[prop];
            return true;
        },
        has: (_target, prop) => prop in (getter() as any),
        ownKeys: () => Reflect.ownKeys(getter()),
        getOwnPropertyDescriptor: (_target, prop) => {
            const desc = Object.getOwnPropertyDescriptor(getter(), prop);
            if (!desc) return undefined;
            return { ...desc, configurable: true };
        },
    }) as T;

const createAsyncValueProxy = <T extends object>(getter: () => T): T =>
    new Proxy({} as T, {
        get: (_target, prop) => {
            const target = getter() as any;
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
        set: (_target, prop, value) => {
            (getter() as any)[prop] = value;
            return true;
        },
        has: (_target, prop) => prop in (getter() as any),
        ownKeys: () => Reflect.ownKeys(getter()),
        getOwnPropertyDescriptor: (_target, prop) => {
            const desc = Object.getOwnPropertyDescriptor(getter(), prop);
            if (!desc) return undefined;
            return { ...desc, configurable: true };
        },
    });

export const fetchRegistry = createAsyncObjectProxy(() => getActiveAsyncRegistry().fetchRegistry);
export const inflight = createAsyncObjectProxy(() => getActiveAsyncRegistry().inflight);
export const requestVersion = createAsyncObjectProxy(() => getActiveAsyncRegistry().requestVersion);
export const cacheMeta = createAsyncObjectProxy(() => getActiveAsyncRegistry().cacheMeta);
export const rateWindowStart = createAsyncObjectProxy(() => getActiveAsyncRegistry().rateWindowStart);
export const rateCount = createAsyncObjectProxy(() => getActiveAsyncRegistry().rateCount);
export const ratePruneState = createAsyncValueProxy(() => getActiveAsyncRegistry().ratePruneState);
export const cleanupSubs = createAsyncObjectProxy(() => getActiveAsyncRegistry().cleanupSubs);
export const storeCleanupFns = createAsyncObjectProxy(() => getActiveAsyncRegistry().storeCleanupFns);
export const revalidateHandlers = createAsyncObjectProxy(() => getActiveAsyncRegistry().revalidateHandlers);
export const noSignalWarned = createAsyncValueProxy(() => getActiveAsyncRegistry().noSignalWarned);
export const autoCreateWarned = createAsyncValueProxy(() => getActiveAsyncRegistry().autoCreateWarned);
export const revalidateKeys = createAsyncValueProxy(() => getActiveAsyncRegistry().revalidateKeys);
export const asyncMetrics = createAsyncValueProxy(() => getActiveAsyncRegistry().asyncMetrics);



export const resetAsyncState = (): void => {
    resetAsyncRegistry(getActiveAsyncRegistry());
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
    autoCreateWarned.delete(name);

    const startsWithName = (key: string) => key === name || key.startsWith(`${name}:`);

    Object.keys(inflight).forEach((k) => { if (startsWithName(k)) delete inflight[k]; });
    Object.keys(requestVersion).forEach((k) => { if (startsWithName(k)) delete requestVersion[k]; });
    Object.keys(cacheMeta).forEach((k) => { if (startsWithName(k)) delete cacheMeta[k]; });
    Object.keys(rateWindowStart).forEach((k) => { if (startsWithName(k)) delete rateWindowStart[k]; });
    Object.keys(rateCount).forEach((k) => { if (startsWithName(k)) delete rateCount[k]; });
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
