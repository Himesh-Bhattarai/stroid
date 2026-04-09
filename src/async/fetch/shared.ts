/**
 * @module async/fetch/shared
 *
 * LAYER: Module
 * OWNS:  Shared helpers for async fetch runtime.
 */
import { getStore, hasStore, setStoreWithContext } from "../../internals/store-ops.js";
import { runWithWriteContext, type WriteContext } from "../../internals/write-context.js";
import { warn } from "../../utils.js";
import type { StoreDefinition } from "../../core/store-lifecycle/types.js";
import type { AsyncStateSnapshot, FetchOptions } from "../cache.js";

export type AsyncState = AsyncStateSnapshot;

export const looksLikeAsyncState = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return ("data" in record) && ("loading" in record) && ("error" in record) && ("status" in record);
};

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
    value !== null
    && (typeof value === "object" || typeof value === "function")
    && typeof (value as { then?: unknown }).then === "function";

export const applyAsyncState = (
    name: string,
    storeHandle: StoreDefinition<string, AsyncState>,
    next: AsyncStateSnapshot,
    options: FetchOptions,
    context: WriteContext | null
): void => {
    if (!hasStore(name)) return;
    const stateAdapter = options.stateAdapter;
    if (stateAdapter) {
        try {
            const prev = getStore({ name } as StoreDefinition<string, unknown>);
            const set = (value: unknown | ((draft: unknown) => void)) => {
                setStoreWithContext(storeHandle, value, undefined, context);
            };
            runWithWriteContext(context, () => {
                stateAdapter({
                    name,
                    prev,
                    next,
                    set,
                });
            });
        } catch (err) {
            warn(`fetchStore("${name}") stateAdapter failed: ${(err as { message?: string })?.message ?? err}`);
        }
        return;
    }
    runWithWriteContext(context, () => {
        setStoreWithContext(storeHandle, next as AsyncState, undefined, context);
    });
};

export const settleAbort = (
    name: string,
    cacheSlot: string,
    version: number,
    applyState: (next: AsyncStateSnapshot) => void,
    isCurrentRequest: (cacheSlot: string, version: number) => boolean
): null => {
    warn(`fetchStore("${name}") aborted`);
    if (isCurrentRequest(cacheSlot, version) && hasStore(name)) {
        applyState({
            loading: false,
            error: "aborted",
            status: "aborted",
            revalidating: false,
        });
    }
    return null;
};
