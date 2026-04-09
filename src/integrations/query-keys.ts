/**
 * @module integrations/query-keys
 *
 * LAYER: Module
 * OWNS:  Lightweight query-key helpers with no async runtime dependency.
 *
 * Consumers: query entrypoint and query integration helpers.
 */
import type { StoreDefinition, StoreKey, StoreName } from "../core/store-lifecycle/types.js";

export type QueryStoreTarget = StoreDefinition<string, unknown> | StoreKey<string, unknown> | StoreName;

const resolveStoreName = (storeName: QueryStoreTarget): string =>
    (typeof storeName === "string" ? storeName : storeName.name);

export const reactQueryKey = (storeName: QueryStoreTarget, cacheKey?: string | number) => {
    const name = resolveStoreName(storeName);
    return cacheKey !== undefined ? ["stroid", name, cacheKey] : ["stroid", name];
};

export const swrKey = reactQueryKey;
