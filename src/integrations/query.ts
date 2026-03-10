import { fetchStore } from "../async.js";
import type { FetchInput, FetchOptions } from "../async-cache.js";

export const reactQueryKey = (storeName: string, cacheKey?: string | number) =>
    cacheKey !== undefined ? ["stroid", storeName, cacheKey] : ["stroid", storeName];

export const createReactQueryFetcher = (
    storeName: string,
    input: FetchInput,
    options: FetchOptions = {}
) => async () => fetchStore(storeName, input, options);

export const swrKey = reactQueryKey;

export const createSwrFetcher = (
    storeName: string,
    input: FetchInput,
    options: FetchOptions = {}
) => async () => fetchStore(storeName, input, options);
