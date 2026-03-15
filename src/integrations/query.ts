/**
 * @module integrations/query
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for integrations/query.
 *
 * Consumers: Internal imports and public API.
 */
import { fetchStore } from "../async.js";
import type { FetchInput, FetchOptions } from "../async-cache.js";
import type { StoreDefinition, StoreKey, StoreName } from "../store-lifecycle/types.js";

type StoreTarget = StoreDefinition<string, unknown> | StoreKey<string, unknown> | StoreName;
const resolveStoreName = (storeName: StoreTarget): string =>
    (typeof storeName === "string" ? storeName : storeName.name);

export const reactQueryKey = (storeName: StoreTarget, cacheKey?: string | number) => {
    const name = resolveStoreName(storeName);
    return cacheKey !== undefined ? ["stroid", name, cacheKey] : ["stroid", name];
};

export const createReactQueryFetcher = (
    storeName: StoreTarget,
    input: FetchInput,
    options: FetchOptions = {}
) => async () => {
    if (typeof storeName === "string") {
        return fetchStore(storeName, input, options);
    }
    return fetchStore(storeName, input, options);
};

export const swrKey = reactQueryKey;

export const createSwrFetcher = (
    storeName: StoreTarget,
    input: FetchInput,
    options: FetchOptions = {}
) => async () => {
    if (typeof storeName === "string") {
        return fetchStore(storeName, input, options);
    }
    return fetchStore(storeName, input, options);
};


