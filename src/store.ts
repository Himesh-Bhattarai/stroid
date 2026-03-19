/**
 * @module store
 *
 * LAYER: Store runtime
 * OWNS:  Module-level behavior and exports for store.
 *
 * Consumers: Internal imports and public API.
 */
// Public store API barrel. Internal modules should import from leaf modules directly.
export type {
    Path,
    PathDepth,
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
} from "./core/store-lifecycle/types.js";
export type {
    FeatureOptions,
    FeatureOptionsMap,
    PersistConfig,
    PersistOptions,
    MiddlewareCtx,
    StoreOptions,
    SnapshotMode,
    SyncOptions,
} from "./adapters/options.js";

export {
    setStore,
    replaceStore,
    deleteStore,
    resetStore,
    hydrateStores,
} from "./core/store-write.js";
export { createStore, createStoreStrict } from "./core/store-create.js";

export {
    setStoreBatch,
    subscribeStore,
    subscribeInternal as _subscribe,
    subscribe,
    getStoreSnapshot,
    getSnapshot as _getSnapshot,
} from "./core/store-notify.js";

export {
    getStore,
    hasStore,
    isLazyStore,
    isStoreMaterialized,
    isLazyPending,
    _hasStoreEntryInternal,
    _getStoreValueRef,
    _getFeatureApi,
    getInitialState,
    getMetrics,
} from "./core/store-read.js";

export { clearAllStores, clearStores } from "./runtime-admin/index.js";

export { store, namespace } from "./core/store-name.js";


