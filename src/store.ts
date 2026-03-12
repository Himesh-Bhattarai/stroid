export type {
    Path,
    PathDepth,
    PathValue,
    PartialDeep,
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
    StoreStateMap,
    StrictStoreMap,
    WriteResult,
} from "./store-lifecycle.js";
export type { PersistConfig, MiddlewareCtx, StoreOptions } from "./adapters/options.js";

export {
    createStore,
    setStore,
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
    _hasStoreEntryInternal,
    _getStoreValueRef,
    _getFeatureApi,
    getInitialState,
    getMetrics,
} from "./store-read.js";

export { clearAllStores, clearStores } from "./runtime-admin.js";

export { store, namespace } from "./store-name.js";
