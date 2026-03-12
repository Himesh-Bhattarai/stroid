import { useMemo } from "react";
import type { FetchInput, FetchOptions } from "./async-cache.js";
import { fetchRegistry, inflight } from "./async-cache.js";
import { fetchStore, refetchStore } from "./async-fetch.js";
import { useAsyncStore } from "./hooks-async.js";

const EMPTY_OPTIONS: FetchOptions = {};

export const useAsyncStoreSuspense = <T = any>(
    name: string,
    input?: FetchInput,
    options?: FetchOptions,
): T => {
    const resolvedOptions = options ?? EMPTY_OPTIONS;
    const snapshot = useAsyncStore(name);
    const pending = snapshot.loading || snapshot.status === "idle";
    const cacheSlot = resolvedOptions.cacheKey ? `${name}:${resolvedOptions.cacheKey}` : name;

    const promise = useMemo(() => {
        if (!pending) return null;
        const active = inflight[cacheSlot]?.promise as Promise<unknown> | undefined;
        if (active) return active;
        if (input !== undefined) return fetchStore(name, input, resolvedOptions);
        if (fetchRegistry[name]) return refetchStore(name);
        return null;
    }, [cacheSlot, input, name, resolvedOptions, pending]);

    if (promise) throw promise;
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot.data as T;
};
