import { useStore } from "./hooks-core.js";
import type { StoreDefinition, StoreKey, StoreName, StateFor } from "./store-lifecycle.js";

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
    const store = useStore<AsyncStoreState>(name as StoreDefinition<string, AsyncStoreState>);
    return {
        data: store?.data ?? null,
        loading: store?.loading ?? false,
        revalidating: store?.revalidating ?? false,
        error: store?.error ?? null,
        status: store?.status ?? "idle",
        isEmpty: store?.data == null && !store?.loading && !store?.error,
    };
}
