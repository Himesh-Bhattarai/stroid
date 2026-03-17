/**
 * @module react/hooks-async
 *
 * LAYER: React hooks
 * OWNS:  Module-level behavior and exports for react/hooks-async.
 *
 * Consumers: Internal imports and public API.
 */
import { useStore } from "./hooks-core.js";
import { store as storeHandle } from "../core/store-name.js";
import type { StoreDefinition, StoreKey, StoreName, StateFor } from "../core/store-lifecycle/types.js";

export type AsyncStoreState<T = unknown> = {
    data: T | null;
    loading: boolean;
    revalidating?: boolean;
    error: string | null;
    status: "idle" | "loading" | "success" | "error" | "aborted";
};

export type AsyncDataFor<State> = State extends { data: infer T } ? T : unknown;

export type AsyncStoreSnapshot<T = unknown> = AsyncStoreState<T> & { isEmpty: boolean };

export function useAsyncStore<Name extends string, State extends AsyncStoreState>(
    name: StoreDefinition<Name, State> | StoreKey<Name, State>
): AsyncStoreSnapshot<AsyncDataFor<State>>;
export function useAsyncStore<Name extends StoreName>(
    name: Name
): AsyncStoreSnapshot<AsyncDataFor<StateFor<Name>>>;
export function useAsyncStore(
    name: string | StoreDefinition<string, AsyncStoreState> | StoreKey<string, AsyncStoreState>
): AsyncStoreSnapshot {
    const handle = typeof name === "string" ? storeHandle<string, AsyncStoreState>(name) : name;
    const snapshot = useStore(handle);
    return {
        data: snapshot?.data ?? null,
        loading: snapshot?.loading ?? false,
        revalidating: snapshot?.revalidating ?? false,
        error: snapshot?.error ?? null,
        status: snapshot?.status ?? "idle",
        isEmpty: snapshot?.data == null && !snapshot?.loading && !snapshot?.error,
    };
}


