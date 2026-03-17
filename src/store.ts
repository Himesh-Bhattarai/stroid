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
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
    StoreStateMap,
    StrictStoreMap,
    WriteResult,
} from "./store-lifecycle/types.js";
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
    createStore,
    createStoreStrict,
    setStore,
    replaceStore,
    deleteStore,
    resetStore,
    hydrateStores,
    useRegistry,
} from "./store-write.js";

export {
    setStoreBatch,
    subscribeStore,
    subscribeInternal as _subscribe,
    subscribe,
    getStoreSnapshot,
    getSnapshot as _getSnapshot,
} from "./store-notify.js";

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
} from "./store-read.js";

export { clearAllStores, clearStores } from "./runtime-admin.js";

export { store, namespace } from "./store-name.js";


