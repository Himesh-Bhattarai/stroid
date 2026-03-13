import { useMemo } from "react";
import type { FetchInput, FetchOptions } from "./async-cache.js";
import { fetchRegistry, inflight } from "./async-cache.js";
import { fetchStore, refetchStore } from "./async-fetch.js";
import { useAsyncStore, type AsyncDataFor, type AsyncStoreState } from "./hooks-async.js";
import { store } from "./store.js";
import type { StoreDefinition, StoreKey, StoreName, StateFor } from "./store-lifecycle.js";

const EMPTY_OPTIONS: FetchOptions = {};

export function useAsyncStoreSuspense<Name extends string, State extends AsyncStoreState, T = AsyncDataFor<State>>(
    name: StoreDefinition<Name, State> | StoreKey<Name, State>,
    input?: FetchInput,
    options?: FetchOptions
): T;
export function useAsyncStoreSuspense<Name extends StoreName, T = AsyncDataFor<StateFor<Name>>>(
    name: Name,
    input?: FetchInput,
    options?: FetchOptions
): T;
export function useAsyncStoreSuspense<T = unknown>(
    name: string | StoreDefinition<string, AsyncStoreState> | StoreKey<string, AsyncStoreState>,
    input?: FetchInput,
    options?: FetchOptions,
): T {
    const resolvedOptions = options ?? EMPTY_OPTIONS;
    const storeName = typeof name === "string" ? name : name.name;
    const storeHandle = useMemo(
        () => (typeof name === "string" ? store(name) : name),
        [name]
    ) as StoreDefinition<string, AsyncStoreState> | StoreKey<string, AsyncStoreState>;
    const snapshot = useAsyncStore(storeHandle as StoreDefinition<string, AsyncStoreState>);
    const pending = snapshot.loading || snapshot.status === "idle";
    const cacheSlot = resolvedOptions.cacheKey ? `${storeName}:${resolvedOptions.cacheKey}` : storeName;

    const promise = useMemo(() => {
        if (!pending) return null;
        const active = inflight[cacheSlot]?.promise as Promise<unknown> | undefined;
        if (active) return active;
        if (input !== undefined) return fetchStore(storeHandle, input, resolvedOptions);
        if (fetchRegistry[storeName]) return refetchStore(storeHandle);
        return null;
    }, [cacheSlot, input, storeHandle, storeName, resolvedOptions, pending]);

    if (promise) throw promise;
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot.data as T;
}
