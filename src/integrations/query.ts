/**
 * @module integrations/query
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for integrations/query.
 *
 * Consumers: Internal imports and public API.
 */
import { fetchStore } from "../async/fetch.js";
import type { FetchInput, FetchOptions } from "../async/cache.js";
import {
    reactQueryKey,
    swrKey,
    type QueryStoreTarget as StoreTarget,
} from "./query-keys.js";

export { reactQueryKey, swrKey } from "./query-keys.js";

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

