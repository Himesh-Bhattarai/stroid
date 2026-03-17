/**
 * @module index
 *
 * LAYER: Public API
 * OWNS:  Module-level behavior and exports for index.
 *
 * Consumers: Internal imports and public API.
 */
// Root public API barrel. Core store API is defined in store.ts and re-exported here.
export {
    createStore,
    createStoreStrict,
    setStore,
    setStoreBatch,
    getStore,
    deleteStore,
    resetStore,
    hasStore,
    hydrateStores,
} from "./store.js";
export { getMetrics } from "./store-read.js";
export { getAsyncMetrics } from "./async-fetch.js";
export { getStoreHealth, findColdStores } from "./runtime-tools.js";
export {
    createComputed,
    invalidateComputed,
    deleteComputed,
    isComputedStore,
} from "./computed.js";
export { namespace, store } from "./store.js";
export type {
    Path,
    PathValue,
    PartialDeep,
    HydrateSnapshotFor,
    HydrationFailure,
    HydrationResult,
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
    StoreStateMap,
    StrictStoreMap,
    WriteResult,
    FeatureOptions,
    FeatureOptionsMap,
    PersistOptions,
    StoreOptions,
    SyncOptions,
} from "./store.js";
export { configureStroid } from "./config.js";
export * as queryIntegrations from "./integrations/query.js";


