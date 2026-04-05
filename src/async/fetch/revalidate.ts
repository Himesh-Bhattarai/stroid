/**
 * @module async/fetch/revalidate
 *
 * LAYER: Module
 * OWNS:  Refetch and focus/online revalidation behavior.
 */
import { hasStore } from "../../internals/store-ops.js";
import { getConfig } from "../../internals/config.js";
import { nameOf } from "../../core/store-lifecycle/identity.js";
import type { StoreDefinition, StoreKey, StoreName } from "../../core/store-lifecycle/types.js";
import { isDev, warn } from "../../utils.js";
import {
    cleanupStoreCleanupsByKind,
    getCacheMeta,
    getFetchRegistry,
    getRevalidateHandlers,
    getRevalidateKeys,
    registerStoreCleanup,
    unregisterStoreCleanup,
    type AsyncStateSnapshot,
    type FetchOptions,
} from "../cache.js";
import { fetchStore } from "./fetch-store.js";

type AsyncState = AsyncStateSnapshot;

export function refetchStore<Name extends string, State>(name: StoreDefinition<Name, State>): Promise<unknown>;
export function refetchStore<Name extends string, State>(name: StoreKey<Name, State>): Promise<unknown>;
export function refetchStore<Name extends StoreName>(name: Name): Promise<unknown>;
export async function refetchStore(nameInput: string | StoreDefinition<string, unknown>): Promise<unknown> {
    const name = nameOf(nameInput as StoreDefinition<string, unknown>);
    if (!hasStore(name)) return undefined;
    const fetchRegistry = getFetchRegistry();
    const last = fetchRegistry[name];
    if (!last) {
        // Fallback: if we don't have a replayable fetch recipe (e.g. direct Promise input),
        // return the most recent cached value for this store when available.
        const prefix = `${name}:`;
        const cacheMeta = getCacheMeta();
        const slots = Object.entries(cacheMeta).filter(([key]) =>
            key === name || key.startsWith(prefix)
        );

        if (slots.length > 0) {
            const [, meta] = slots.reduce(
                (latest, entry) =>
                    entry[1].timestamp >= latest[1].timestamp ? entry : latest
            );
            return meta.data;
        }

        if (isDev()) {
            warn(
                `refetchStore("${name}") - no previous fetch found.\n` +
                `Call fetchStore("${name}", url) first.`
            );
        }
        return undefined;
    }
    const handle = { name } as StoreDefinition<string, AsyncState>;
    if (last.kind === "factory") {
        return fetchStore(handle, last.factory, last.options);
    }
    return fetchStore(handle, last.url, last.options);
}

export function enableRevalidateOnFocus<Name extends string, State>(
    name: StoreDefinition<Name, State>,
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void);
export function enableRevalidateOnFocus<Name extends string, State>(
    name: StoreKey<Name, State>,
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void);
export function enableRevalidateOnFocus<Name extends StoreName>(
    name?: Name | "*",
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void);
export function enableRevalidateOnFocus(
    nameInput?: string | StoreDefinition<string, unknown>,
    overrides?: Partial<FetchOptions> & { debounceMs?: number; maxConcurrent?: number; staggerMs?: number; priority?: "high" | "normal" }
): (() => void) {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
    const revalidateKeys = getRevalidateKeys();
    const revalidateHandlers = getRevalidateHandlers();
    const resolvedName = nameInput === "*" ? "*" : (nameInput ? nameOf(nameInput as StoreDefinition<string, unknown>) : undefined);
    const key = resolvedName ?? "*";
    if (revalidateKeys.has(key)) return revalidateHandlers[key] ?? (() => {});
    const focusConfig = getConfig().revalidateOnFocus;
    const debounceMs = Math.max(0, overrides?.debounceMs ?? focusConfig.debounceMs);
    const maxConcurrent = Math.max(1, overrides?.maxConcurrent ?? focusConfig.maxConcurrent);
    const staggerMs = Math.max(0, overrides?.staggerMs ?? focusConfig.staggerMs);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const scheduledTimers = new Set<ReturnType<typeof setTimeout>>();

    const clearScheduledTimer = (timer: ReturnType<typeof setTimeout> | null): void => {
        if (timer === null) return;
        clearTimeout(timer);
        scheduledTimers.delete(timer);
    };

    const schedule = (callback: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
        const timer = setTimeout(() => {
            scheduledTimers.delete(timer);
            if (disposed) return;
            callback();
        }, delayMs);
        scheduledTimers.add(timer);
        return timer;
    };

    const runRefetch = () => {
        if (disposed) return;
        const fetchRegistry = getFetchRegistry();
        let targets = key === "*" ? Object.keys(fetchRegistry) : [key];
        if (overrides?.priority === "high" && key !== "*") {
            targets = [key, ...targets.filter((t) => t !== key)];
        }
        if (targets.length === 0) return;
        let index = 0;
        const launchNext = () => {
            if (disposed) return;
            const batch = targets.slice(index, index + maxConcurrent);
            batch.forEach((storeName, offset) => {
                const fire = () => {
                    if (disposed) return;
                    const fetchRegistry = getFetchRegistry();
                    const last = fetchRegistry[storeName];
                    if (!last) {
                        void refetchStore({ name: storeName } as StoreDefinition<string, AsyncState>);
                        return;
                    }
                    if (last.kind === "factory") {
                        void fetchStore({ name: storeName } as StoreDefinition<string, AsyncState>, last.factory, last.options);
                    } else {
                        void fetchStore({ name: storeName } as StoreDefinition<string, AsyncState>, last.url, last.options);
                    }
                };
                if (staggerMs > 0) {
                    schedule(fire, offset * staggerMs);
                } else {
                    fire();
                }
            });
            index += batch.length;
            if (index < targets.length) {
                const delayMs = staggerMs > 0 ? staggerMs * Math.max(1, batch.length) : 0;
                schedule(launchNext, delayMs);
            }
        };
        launchNext();
    };

    const handler = () => {
        if (disposed) return;
        // For zero-debounce configs, run immediately to avoid relying on timers
        // (helps test environments and keeps default behaviour snappy).
        if (debounceMs === 0) {
            runRefetch();
            return;
        }
        clearScheduledTimer(debounceTimer);
        debounceTimer = schedule(runRefetch, debounceMs);
    };

    window.addEventListener("focus", handler);
    window.addEventListener("online", handler);
    revalidateKeys.add(key);
    const cleanup = () => {
        disposed = true;
        window.removeEventListener("focus", handler);
        window.removeEventListener("online", handler);
        clearScheduledTimer(debounceTimer);
        debounceTimer = null;
        scheduledTimers.forEach((timer) => clearTimeout(timer));
        scheduledTimers.clear();
        revalidateKeys.delete(key);
        delete revalidateHandlers[key];
        unregisterStoreCleanup(key, cleanup, "revalidate");
    };
    revalidateHandlers[key] = cleanup;
    registerStoreCleanup(key, cleanup, "revalidate");
    return cleanup;
}

export const cleanupAllRevalidateHandlers = (): void => {
    cleanupStoreCleanupsByKind("revalidate");
};
